// === Динамическое добавление меток ===
const beaconsContainer = document.getElementById('beaconsContainer');
const addBeaconBtn = document.getElementById('addBeacon');
const resultsDiv = document.getElementById('results');
const canvas = document.getElementById('room');
const ctx = canvas.getContext('2d');

let beacons = [];
let beaconId = 0;

function createBeaconRow(beacon = {}) {
    beaconId++;
    const row = document.createElement('div');
    row.className = 'beacon-row';
    row.innerHTML = `
        <input type="text" placeholder="Название" class="beacon-name" value="${beacon.name || ''}" required>
        <input type="number" step="any" placeholder="X (м)" class="beacon-x" value="${beacon.x || ''}" required>
        <input type="number" step="any" placeholder="Y (м)" class="beacon-y" value="${beacon.y || ''}" required>
        <input type="number" step="any" placeholder="RSSI (дБм)" class="beacon-rssi" value="${beacon.rssi || ''}" required>
        <button type="button" class="remove-beacon">✕</button>
    `;
    row.querySelector('.remove-beacon').onclick = () => {
        row.remove();
        updateBeaconsFromDOM();
    };
    row.querySelectorAll('input').forEach(input => {
        input.oninput = updateBeaconsFromDOM;
    });
    return row;
}

function updateBeaconsFromDOM() {
    beacons = [];
    beaconsContainer.querySelectorAll('.beacon-row').forEach(row => {
        const name = row.querySelector('.beacon-name').value;
        const x = parseFloat(row.querySelector('.beacon-x').value);
        const y = parseFloat(row.querySelector('.beacon-y').value);
        const rssi = parseFloat(row.querySelector('.beacon-rssi').value);
        if (name && !isNaN(x) && !isNaN(y) && !isNaN(rssi)) {
            beacons.push({ name, x, y, rssi });
        }
    });
}

addBeaconBtn.onclick = () => {
    beaconsContainer.appendChild(createBeaconRow());
    updateBeaconsFromDOM();
};
// Добавим три маяка по умолчанию
for (let i = 0; i < 3; i++) addBeaconBtn.onclick();

// === Расчет расстояния по RSSI ===
function rssiToDistance(rssi, txPower, n, obstacleLoss, snr) {
    // Поправка на интерференцию
    const interferenceLoss = -10 * Math.log10(1 + 1 / snr);
    // Учет внешних факторов (препятствия и интерференция)
    const effectiveRSSI = rssi - obstacleLoss - interferenceLoss;
    // Формула для расчета расстояния
    return Math.pow(10, (txPower - effectiveRSSI) / (10 * n));
}

// === LLS ===
function llsTrilateration(markers) {
    if (markers.length < 3) return null;
    const sorted = [...markers].sort((a, b) => a.dist - b.dist);
    const [A, B, C] = sorted;
    const x1 = A.x, y1 = A.y;
    const x2 = B.x, y2 = B.y;
    const x3 = C.x, y3 = C.y;
    const d1 = A.dist, d2 = B.dist, d3 = C.dist;
    const S = 2 * (x1*(y2-y3) + x2*(y3-y1) + x3*(y1-y2));
    if (Math.abs(S) < 1e-8) return null;
    const x = ((d1*d1 - d2*d2 + x2*x2 - x1*x1 + y2*y2 - y1*y1) * (y3 - y1) - (d1*d1 - d3*d3 + x3*x3 - x1*x1 + y3*y3 - y1*y1) * (y2 - y1)) / S;
    const y = ((d1*d1 - d3*d3 + x3*x3 - x1*x1 + y3*y3 - y1*y1) * (x2 - x1) - (d1*d1 - d2*d2 + x2*x2 - x1*x1 + y2*y2 - y1*y1) * (x3 - x1)) / S;
    return { x, y };
}

// === WLS ===
function wlsTrilateration(markers) {
    if (markers.length < 3) return null;
    let sumW = 0, x = 0, y = 0;
    for (const m of markers) {
        const w = 1 / (m.dist * m.dist + 1e-8);
        sumW += w;
        x += m.x * w;
        y += m.y * w;
    }
    return { x: x / sumW, y: y / sumW };
}

// === NLS (Левенберг-Марквардт) ===
function nlsTrilateration(markers, initialGuess = null, maxIterations = 100, tolerance = 1e-6) {
    if (markers.length < 3) return null;
    let x;
    if (initialGuess && Array.isArray(initialGuess) && initialGuess.length === 2) {
        x = [...initialGuess];
    } else {
        x = markers.reduce((acc, b) => [acc[0] + b.x, acc[1] + b.y], [0, 0]);
        x = [x[0] / markers.length, x[1] / markers.length];
    }
    let lambda = 0.001;
    let iter = 0;
    let delta = [Infinity, Infinity];
    while (iter < maxIterations && (Math.abs(delta[0]) > tolerance || Math.abs(delta[1]) > tolerance)) {
        const residuals = markers.map(b => {
            const dx = x[0] - b.x;
            const dy = x[1] - b.y;
            const r = Math.sqrt(dx*dx + dy*dy) || 1e-8;
            return r - b.dist;
        });
        const J = markers.map(b => {
            const dx = x[0] - b.x;
            const dy = x[1] - b.y;
            const r = Math.sqrt(dx*dx + dy*dy) || 1e-8;
            return [dx / r, dy / r];
        });
        const JT = J[0].map((_, i) => J.map(row => row[i]));
        const JTJ = [
            [JT[0].reduce((acc, val, i) => acc + val * J[i][0], 0), JT[0].reduce((acc, val, i) => acc + val * J[i][1], 0)],
            [JT[1].reduce((acc, val, i) => acc + val * J[i][0], 0), JT[1].reduce((acc, val, i) => acc + val * J[i][1], 0)]
        ];
        JTJ[0][0] += lambda;
        JTJ[1][1] += lambda;
        const JTr = [
            JT[0].reduce((acc, val, i) => acc + val * residuals[i], 0),
            JT[1].reduce((acc, val, i) => acc + val * residuals[i], 0)
        ].map(v => -v);
        const determinant = JTJ[0][0] * JTJ[1][1] - JTJ[0][1] * JTJ[1][0];
        if (Math.abs(determinant) < 1e-12) break;
        delta = [
            (JTJ[1][1] * JTr[0] - JTJ[0][1] * JTr[1]) / determinant,
            (-JTJ[1][0] * JTr[0] + JTJ[0][0] * JTr[1]) / determinant
        ];
        x[0] += delta[0];
        x[1] += delta[1];
        lambda *= 0.9;
        iter++;
    }
    return { x: x[0], y: x[1] };
}

// === Визуализация (аналогично trilateration.js, с инверсией Y) ===
function drawAllCircles(markers) {
    if (markers.length < 3) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const sorted = [...markers].sort((a, b) => a.dist - b.dist);
    const base = sorted[0];
    // Находим min/max для автосмещения
    let minX = markers[0].x, maxX = markers[0].x, minY = markers[0].y, maxY = markers[0].y;
    markers.forEach(m => {
        minX = Math.min(minX, m.x - m.dist);
        maxX = Math.max(maxX, m.x + m.dist);
        minY = Math.min(minY, m.y - m.dist);
        maxY = Math.max(maxY, m.y + m.dist);
    });
    // Добавляем отступы
    const padding = 20;
    const width = Math.ceil(maxX - minX + 2 * padding);
    const height = Math.ceil(maxY - minY + 2 * padding);
    // Минимальный размер
    canvas.width = Math.max(600, width);
    canvas.height = Math.max(600, height);
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    // Новый масштаб
    const scaleX = (canvas.width - 2 * padding) / (maxX - minX + 1);
    const scaleY = (canvas.height - 2 * padding) / (maxY - minY + 1);
    const scaleDraw = Math.min(scaleX, scaleY);
    // Смещение для центрирования
    const offsetX = padding - minX * scaleDraw;
    const offsetY = padding - minY * scaleDraw;
    markers.forEach((m) => {
        ctx.beginPath();
        ctx.arc(offsetX + m.x * scaleDraw, canvas.height - (offsetY + m.y * scaleDraw), m.dist * scaleDraw, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(255,0,0,0.4)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(offsetX + m.x * scaleDraw, canvas.height - (offsetY + m.y * scaleDraw), 5, 0, 2 * Math.PI);
        ctx.fillStyle = 'red';
        ctx.fill();
        ctx.font = '12px Arial';
        ctx.fillStyle = 'white';
        ctx.fillText(m.name, offsetX + m.x * scaleDraw + 8, canvas.height - (offsetY + m.y * scaleDraw) - 8);
    });
    return { offsetX, offsetY, scaleDraw };
}

function drawMethodPoint(point, offsetX, offsetY, scaleDraw, color, label) {
    if (!point) return;
    ctx.beginPath();
    ctx.arc(offsetX + point.x * scaleDraw, canvas.height - (offsetY + point.y * scaleDraw), 7, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.font = 'bold 14px Arial';
    ctx.fillStyle = color;
    ctx.fillText(label, offsetX + point.x * scaleDraw + 10, canvas.height - (offsetY + point.y * scaleDraw));
}

function circleIntersections(c1, r1, c2, r2) {
    const dx = c2.x - c1.x;
    const dy = c2.y - c1.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > r1 + r2 || d < Math.abs(r1 - r2) || d === 0) return [];
    const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
    const h = Math.sqrt(r1 * r1 - a * a);
    const xm = c1.x + (a * dx) / d;
    const ym = c1.y + (a * dy) / d;
    const xs1 = xm + (h * dy) / d;
    const ys1 = ym - (h * dx) / d;
    const xs2 = xm - (h * dy) / d;
    const ys2 = ym + (h * dx) / d;
    return [
        { x: xs1, y: ys1 },
        { x: xs2, y: ys2 }
    ];
}

function drawIntersections(markers, offsetX, offsetY, scaleDraw) {
    for (let i = 0; i < markers.length; i++) {
        for (let j = i + 1; j < markers.length; j++) {
            const p1 = markers[i];
            const p2 = markers[j];
            const r1 = markers[i].dist * scaleDraw;
            const r2 = markers[j].dist * scaleDraw;
            const inters = circleIntersections(p1, r1, p2, r2);
            inters.forEach((pt, idx) => {
                ctx.beginPath();
                ctx.arc(offsetX + pt.x * scaleDraw, canvas.height - (offsetY + pt.y * scaleDraw), 5, 0, 2 * Math.PI);
                ctx.fillStyle = 'lime';
                ctx.fill();
                ctx.font = '12px Arial';
                ctx.fillStyle = 'lime';
                ctx.fillText(`I${i+1}${j+1}.${idx+1}`, offsetX + pt.x * scaleDraw + 8, canvas.height - (offsetY + pt.y * scaleDraw));
            });
        }
    }
}

// === Основной обработчик ===
document.getElementById('calcTrilatRssi').onclick = () => {
    updateBeaconsFromDOM();
    if (beacons.length < 3) {
        resultsDiv.innerHTML = 'Добавьте минимум 3 метки.';
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }
    // Получаем параметры среды
    const txPower = parseFloat(document.getElementById('txPower').value);
    const n = parseFloat(document.getElementById('n').value);
    const obstacleLoss = parseFloat(document.getElementById('obstacleLoss').value);
    const snr = parseFloat(document.getElementById('snr').value);
    // Считаем расстояния для каждой метки
    const markers = beacons.map(b => ({
        name: b.name,
        x: b.x,
        y: b.y,
        dist: rssiToDistance(b.rssi, txPower, n, obstacleLoss, snr)
    }));
    // Проверка валидности
    let invalids = markers.filter(m => isNaN(m.x) || isNaN(m.y) || isNaN(m.dist) || m.dist <= 0);
    if (invalids.length > 0) {
        resultsDiv.innerHTML = 'Проверьте значения всех меток и параметров среды.';
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        console.warn('Некорректные метки:', invalids);
        return;
    }
    let res = '<b>Результаты трилатерации:</b><br>';
    const lls = llsTrilateration(markers);
    const wls = wlsTrilateration(markers);
    const nls = nlsTrilateration(markers);
    let llsResiduals = '';
    if (lls) {
        const sorted = [...markers].sort((a, b) => a.dist - b.dist);
        const [A, B, C] = sorted;
        const dists = [A, B, C].map(m => {
            const d = Math.sqrt((lls.x - m.x) ** 2 + (lls.y - m.y) ** 2);
            return d;
        });
        llsResiduals = '<br><b>Остатки (LLS):</b><br>' + dists.map((d, i) => `Метка ${i+1}: ${d.toFixed(2)} м (ожидалось ${[A,B,C][i].dist.toFixed(2)} м)`).join('<br>');
    }
    res += `<b>LLS:</b> ${lls ? `${lls.x.toFixed(2)}, ${lls.y.toFixed(2)}` : 'Ошибка/Коллинеарность'}${llsResiduals}<br>`;
    res += `<b>WLS:</b> ${wls ? `${wls.x.toFixed(2)}, ${wls.y.toFixed(2)}` : 'Ошибка'}<br>`;
    res += `<b>NLS:</b> ${nls ? `${nls.x.toFixed(2)}, ${nls.y.toFixed(2)}` : 'Ошибка'}<br>`;
    resultsDiv.innerHTML = res;
    const drawParams = drawAllCircles(markers);
    if (drawParams) {
        drawMethodPoint(lls, drawParams.offsetX, drawParams.offsetY, drawParams.scaleDraw, 'blue', 'LLS');
        drawMethodPoint(wls, drawParams.offsetX, drawParams.offsetY, drawParams.scaleDraw, 'orange', 'WLS');
        drawMethodPoint(nls, drawParams.offsetX, drawParams.offsetY, drawParams.scaleDraw, 'purple', 'NLS');
        drawIntersections(markers, drawParams.offsetX, drawParams.offsetY, drawParams.scaleDraw);
    }
}; 