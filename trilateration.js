const canvas = document.getElementById('room');
const ctx = canvas.getContext('2d');
const scale = 50; // Масштаб: 1 метр = 50 пикселей

let points = [];
let lines = [];

// === Динамическое добавление меток ===
const markersContainer = document.getElementById('markersContainer');
const addMarkerBtn = document.getElementById('addMarker');
const resultsDiv = document.getElementById('results');

let markers = [];
let markerId = 0;

// === Функция для создания строки ввода метки ===
// Создаёт DOM-элемент для одной метки с полями: название, X, Y, расстояние
function createMarkerRow(marker = {}) {
    markerId++;
    const row = document.createElement('div');
    row.className = 'marker-row';
    row.innerHTML = `
        <input type="text" placeholder="Название" class="marker-name" value="${marker.name || ''}" required>
        <input type="number" step="any" placeholder="X (м)" class="marker-x" value="${marker.x || ''}" required>
        <input type="number" step="any" placeholder="Y (м)" class="marker-y" value="${marker.y || ''}" required>
        <input type="number" step="any" placeholder="Расстояние (м)" class="marker-dist" value="${marker.dist || ''}" required>
        <button type="button" class="remove-marker">✕</button>
    `;
    // Кнопка удаления метки
    row.querySelector('.remove-marker').onclick = () => {
        row.remove();
        updateMarkersFromDOM();
    };
    // Обновлять массив markers при изменении любого поля
    row.querySelectorAll('input').forEach(input => {
        input.oninput = updateMarkersFromDOM;
    });
    return row;
}

// === Функция для сбора данных о метках из DOM ===
// Обновляет массив markers на основе текущих значений в форме
function updateMarkersFromDOM() {
    markers = [];
    markersContainer.querySelectorAll('.marker-row').forEach(row => {
        const name = row.querySelector('.marker-name').value;
        const x = parseFloat(row.querySelector('.marker-x').value);
        const y = parseFloat(row.querySelector('.marker-y').value);
        const dist = parseFloat(row.querySelector('.marker-dist').value);
        if (name && !isNaN(x) && !isNaN(y) && !isNaN(dist)) {
            markers.push({ name, x, y, dist });
        }
    });
}

addMarkerBtn.onclick = () => {
    markersContainer.appendChild(createMarkerRow());
    updateMarkersFromDOM();
};
// Добавим три метки по умолчанию
for (let i = 0; i < 3; i++) addMarkerBtn.onclick();

// === Проверка коллинеарности трёх точек ===
// Возвращает true, если три точки (по x/y) лежат на одной прямой
function areCollinear(p1, p2, p3, eps = 1e-8) {
    // По площади треугольника
    const area = 0.5 * Math.abs(
        p1.x * (p2.y - p3.y) +
        p2.x * (p3.y - p1.y) +
        p3.x * (p1.y - p2.y)
    );
    return area < eps;
}

// === Поиск базовой метки (с минимальным расстоянием) ===
function findBaseMarker() {
    if (markers.length === 0) return null;
    return markers.reduce((min, m) => m.dist < min.dist ? m : min, markers[0]);
}

document.getElementById('checkCollinearity').onclick = () => {
    updateMarkersFromDOM();
    if (markers.length < 3) {
        resultsDiv.innerHTML = 'Добавьте минимум 3 метки.';
        return;
    }
    const base = findBaseMarker();
    let res = `<b>Базовая метка:</b> ${base.name} (${base.x}, ${base.y})<br><b>Коллинеарные тройки:</b><br>`;
    let found = false;
    for (let i = 0; i < markers.length; i++) {
        for (let j = i + 1; j < markers.length; j++) {
            for (let k = j + 1; k < markers.length; k++) {
                const triple = [markers[i], markers[j], markers[k]];
                if (triple.includes(base) && areCollinear(...triple)) {
                    res += `${triple.map(m => m.name).join(' — ')}<br>`;
                    found = true;
                }
            }
        }
    }
    if (!found) res += 'Коллинеарных троек не найдено.';
    resultsDiv.innerHTML = res;
};

// === Метод линейной трилатерации (LLS) ===
// Возвращает {x, y} — координаты источника, минимизирующие сумму квадратов ошибок
function llsTrilateration(markers) {
    if (markers.length < 3) return null;
    // Берём три ближайшие метки
    const sorted = [...markers].sort((a, b) => a.dist - b.dist);
    const [A, B, C] = sorted;
    // Координаты и расстояния
    const x1 = A.x, y1 = A.y;
    const x2 = B.x, y2 = B.y;
    const x3 = C.x, y3 = C.y;
    const d1 = A.dist, d2 = B.dist, d3 = C.dist;
    // Формулы для решения системы трёх окружностей
    const S = 2 * (x1*(y2-y3) + x2*(y3-y1) + x3*(y1-y2));
    if (Math.abs(S) < 1e-8) return null; // Коллинеарность
    const x = ((d1*d1 - d2*d2 + x2*x2 - x1*x1 + y2*y2 - y1*y1) * (y3 - y1) - (d1*d1 - d3*d3 + x3*x3 - x1*x1 + y3*y3 - y1*y1) * (y2 - y1)) / S;
    const y = ((d1*d1 - d3*d3 + x3*x3 - x1*x1 + y3*y3 - y1*y1) * (x2 - x1) - (d1*d1 - d2*d2 + x2*x2 - x1*x1 + y2*y2 - y1*y1) * (x3 - x1)) / S;
    return { x, y };
}

// === Метод взвешенной трилатерации (WLS) ===
// Возвращает {x, y} — координаты, усреднённые с весами, обратно пропорциональными квадрату расстояния
function wlsTrilateration(markers) {
    if (markers.length < 3) return null;
    let sumW = 0, x = 0, y = 0;
    for (const m of markers) {
        const w = 1 / (m.dist * m.dist + 1e-8); // Вес — чем ближе, тем больше
        sumW += w;
        x += m.x * w;
        y += m.y * w;
    }
    return { x: x / sumW, y: y / sumW };
}

// === Метод нелинейной трилатерации (NLS, Левенберг-Марквардт) ===
// markers: массив {x, y, dist}
// initialGuess: [x, y] — начальное приближение (по умолчанию — среднее по координатам)
// maxIterations: максимум итераций
// tolerance: точность остановки
// Возвращает {x, y} — найденные координаты источника
function nlsTrilateration(markers, initialGuess = null, maxIterations = 100, tolerance = 1e-6) {
    if (markers.length < 3) return null;
    // Инициализация начального предположения
    let x;
    if (initialGuess && Array.isArray(initialGuess) && initialGuess.length === 2) {
        x = [...initialGuess];
    } else {
        // Среднее координат маяков
        x = markers.reduce((acc, b) => [acc[0] + b.x, acc[1] + b.y], [0, 0]);
        x = [x[0] / markers.length, x[1] / markers.length];
    }
    let lambda = 0.001; // Параметр Левенберга-Марквардта
    let iter = 0;
    let delta = [Infinity, Infinity];
    while (iter < maxIterations && (Math.abs(delta[0]) > tolerance || Math.abs(delta[1]) > tolerance)) {
        // Остатки (разница между расчетным и измеренным расстоянием)
        const residuals = markers.map(b => {
            const dx = x[0] - b.x;
            const dy = x[1] - b.y;
            const r = Math.sqrt(dx*dx + dy*dy) || 1e-8;
            return r - b.dist;
        });
        // Матрица Якоби (производные по x и y)
        const J = markers.map(b => {
            const dx = x[0] - b.x;
            const dy = x[1] - b.y;
            const r = Math.sqrt(dx*dx + dy*dy) || 1e-8;
            return [dx / r, dy / r];
        });
        // Транспонирование J
        const JT = J[0].map((_, i) => J.map(row => row[i]));
        // JTJ — матрица Гессе
        const JTJ = [
            [JT[0].reduce((acc, val, i) => acc + val * J[i][0], 0), JT[0].reduce((acc, val, i) => acc + val * J[i][1], 0)],
            [JT[1].reduce((acc, val, i) => acc + val * J[i][0], 0), JT[1].reduce((acc, val, i) => acc + val * J[i][1], 0)]
        ];
        // Добавление lambda к диагонали
        JTJ[0][0] += lambda;
        JTJ[1][1] += lambda;
        // -J^T * residuals
        const JTr = [
            JT[0].reduce((acc, val, i) => acc + val * residuals[i], 0),
            JT[1].reduce((acc, val, i) => acc + val * residuals[i], 0)
        ].map(v => -v);
        // Решение системы 2x2 (через определитель)
        const determinant = JTJ[0][0] * JTJ[1][1] - JTJ[0][1] * JTJ[1][0];
        if (Math.abs(determinant) < 1e-12) break; // Вырожденная матрица
        delta = [
            (JTJ[1][1] * JTr[0] - JTJ[0][1] * JTr[1]) / determinant,
            (-JTJ[1][0] * JTr[0] + JTJ[0][0] * JTr[1]) / determinant
        ];
        // Обновление координат
        x[0] += delta[0];
        x[1] += delta[1];
        // Адаптация lambda (уменьшаем для сходимости)
        lambda *= 0.9;
        iter++;
    }
    return { x: x[0], y: x[1] };
}

// === Визуализация окружностей и точек на canvas ===
// Рисует все окружности, центры и подписи меток, возвращает параметры для дальнейшей отрисовки
function drawAllCircles(markers) {
    if (markers.length < 3) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const sorted = [...markers].sort((a, b) => a.dist - b.dist);
    const base = sorted[0];
    canvas.width = 600;
    canvas.height = 600;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    let minX = markers[0].x, maxX = markers[0].x, minY = markers[0].y, maxY = markers[0].y;
    markers.forEach(m => {
        minX = Math.min(minX, m.x - m.dist);
        maxX = Math.max(maxX, m.x + m.dist);
        minY = Math.min(minY, m.y - m.dist);
        maxY = Math.max(maxY, m.y + m.dist);
    });
    const scaleX = (canvas.width - 40) / (maxX - minX + 1);
    const scaleY = (canvas.height - 40) / (maxY - minY + 1);
    const scaleDraw = Math.min(scaleX, scaleY);
    const offsetX = centerX - (base.x - minX) * scaleDraw;
    const offsetY = centerY - (base.y - minY) * scaleDraw;
    // Рисуем окружности и центры
    markers.forEach((m) => {
        ctx.beginPath();
        ctx.arc(offsetX + m.x * scaleDraw, canvas.height - (offsetY + m.y * scaleDraw), m.dist * scaleDraw, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(255,0,0,0.4)';
        ctx.lineWidth = 2;
        ctx.stroke();
        // Центр
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

// === Визуализация найденной точки LLS ===
// Рисует синюю точку и подпись LLS
function drawLLSPoint(lls, offsetX, offsetY, scaleDraw) {
    if (!lls) return;
    ctx.beginPath();
    ctx.arc(offsetX + lls.x * scaleDraw, canvas.height - (offsetY + lls.y * scaleDraw), 7, 0, 2 * Math.PI);
    ctx.fillStyle = 'blue';
    ctx.fill();
    ctx.font = 'bold 14px Arial';
    ctx.fillStyle = 'blue';
    ctx.fillText('LLS', offsetX + lls.x * scaleDraw + 10, canvas.height - (offsetY + lls.y * scaleDraw));
}

// === Поиск точек пересечения двух окружностей ===
// Возвращает массив из 0, 1 или 2 точек пересечения (x, y)
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

// === Визуализация точек пересечения окружностей ===
// Рисует зелёные точки для всех пар окружностей
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

document.getElementById('calcCoords').onclick = () => {
    updateMarkersFromDOM();
    if (markers.length < 3) {
        resultsDiv.innerHTML = 'Добавьте минимум 3 метки.';
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }
    let invalids = markers.filter(m => isNaN(m.x) || isNaN(m.y) || isNaN(m.dist) || m.dist <= 0);
    if (invalids.length > 0) {
        resultsDiv.innerHTML = 'Проверьте значения всех меток: X, Y и расстояние должны быть заданы и расстояние > 0.';
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        console.warn('Некорректные метки:', invalids);
        return;
    }
    console.log('Метки для визуализации:', markers);
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
        llsResiduals = '<br><b>Остатки (LLS):</b><br>' + dists.map((d, i) => `Метка ${i+1}: ${d.toFixed(2)} м (ожидалось ${[A,B,C][i].dist} м)`).join('<br>');
    }
    res += `<b>LLS:</b> ${lls ? `${lls.x.toFixed(2)}, ${lls.y.toFixed(2)}` : 'Ошибка/Коллинеарность'}${llsResiduals}<br>`;
    res += `<b>WLS:</b> ${wls ? `${wls.x.toFixed(2)}, ${wls.y.toFixed(2)}` : 'Ошибка'}<br>`;
    res += `<b>NLS:</b> ${nls ? `${nls.x.toFixed(2)}, ${nls.y.toFixed(2)}` : 'Ошибка'}<br>`;
    resultsDiv.innerHTML = res;
    const drawParams = drawAllCircles(markers);
    if (lls && drawParams) {
        drawLLSPoint(lls, drawParams.offsetX, drawParams.offsetY, drawParams.scaleDraw);
        drawIntersections(markers, drawParams.offsetX, drawParams.offsetY, drawParams.scaleDraw);
    }
};

// Функция для отрисовки сетки и подписей
function drawGrid(width, length) {
    ctx.clearRect(0, 0, canvas.width, canvas.height); // Очистка Canvas
    // Установка размеров Canvas
    canvas.width = width * scale;
    canvas.height = length * scale;
    // Рисуем сетку
    ctx.strokeStyle = '#a9a9a9';
    ctx.lineWidth = 1;
    for (let x = 0; x <= width; x++) {
        ctx.beginPath();
        ctx.moveTo(x * scale, 0);
        ctx.lineTo(x * scale, length * scale);
        ctx.stroke();
        // Подписи оси X (Ширина)
        ctx.fillStyle = 'white';
        ctx.fillText(`${x} м`, x * scale + 5, 15);
    }
    for (let y = 0; y <= length; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * scale);
        ctx.lineTo(width * scale, y * scale);
        ctx.stroke();
        // Подписи оси Y (Длина)
        ctx.fillStyle = 'white';
        ctx.fillText(`${y} м`, 5, y * scale + 15);
    }
    // Подписи осей
    ctx.fillStyle = 'white';
    ctx.font = '14px Arial';
    ctx.fillText('Ширина (X)', canvas.width / 2 - 30, canvas.height - 10);
    ctx.fillText('Длина (Y)', 10, canvas.height / 2 + 5);
}

// Функция для отрисовки меток и объекта
function drawMarkersAndObject(markers, x, y) {
    // Отрисовка меток
    markers.forEach(marker => {
        ctx.beginPath();
        ctx.arc(marker.x * scale, marker.y * scale, 5, 0, 2 * Math.PI);
        ctx.fillStyle = 'red';
        ctx.fill();
        ctx.stroke();
    });
    // Отрисовка объекта
    ctx.beginPath();
    ctx.arc(x * scale, y * scale, 5, 0, 2 * Math.PI);
    ctx.fillStyle = 'blue';
    ctx.fill();
    ctx.stroke();
}

// Функция для расчета положения объекта
function calculatePosition() {
    // Получение данных из формы
    const width = parseFloat(document.getElementById('width').value);
    const length = parseFloat(document.getElementById('length').value);
    const markers = [
        {
            x: parseFloat(document.getElementById('marker1X').value),
            y: parseFloat(document.getElementById('marker1Y').value),
            rssi: parseFloat(document.getElementById('rssi1').value)
        },
        {
            x: parseFloat(document.getElementById('marker2X').value),
            y: parseFloat(document.getElementById('marker2Y').value),
            rssi: parseFloat(document.getElementById('rssi2').value)
        },
        {
            x: parseFloat(document.getElementById('marker3X').value),
            y: parseFloat(document.getElementById('marker3Y').value),
            rssi: parseFloat(document.getElementById('rssi3').value)
        }
    ];
    // Проверка на корректность введенных данных
    if (isNaN(width) || isNaN(length) || markers.some(m => isNaN(m.x) || isNaN(m.y) || isNaN(m.rssi))) {
        return; // Если данные некорректны, прекращаем выполнение
    }
    // Преобразование RSSI (в dB) в расстояние (в метрах)
    function rssiToDistance(rssi) {
        const txPower = -59; // Мощность передатчика на расстоянии 1 метр (в dB)
        const n = 2.5; // Коэффициент затухания (зависит от среды)
        return Math.pow(10, (txPower - rssi) / (10 * n));
    }
    // Расчет положения объекта методом трилатерации
    const distances = markers.map(marker => rssiToDistance(marker.rssi));
    const A = 2 * markers[1].x - 2 * markers[0].x;
    const B = 2 * markers[1].y - 2 * markers[0].y;
    const C = Math.pow(distances[0], 2) - Math.pow(distances[1], 2) - Math.pow(markers[0].x, 2) + Math.pow(markers[1].x, 2) - Math.pow(markers[0].y, 2) + Math.pow(markers[1].y, 2);
    const D = 2 * markers[2].x - 2 * markers[0].x;
    const E = 2 * markers[2].y - 2 * markers[0].y;
    const F = Math.pow(distances[0], 2) - Math.pow(distances[2], 2) - Math.pow(markers[0].x, 2) + Math.pow(markers[2].x, 2) - Math.pow(markers[0].y, 2) + Math.pow(markers[2].y, 2);
    const x = (C * E - F * B) / (E * A - B * D);
    const y = (A * F - D * C) / (A * E - B * D);
    // Отрисовка сетки
    drawGrid(width, length);
    // Отрисовка меток и объекта
    drawMarkersAndObject(markers, x, y);
    // Отрисовка сохраненных линий
    lines.forEach(line => {
        ctx.beginPath();
        ctx.moveTo(line.x1, line.y1);
        ctx.lineTo(line.x2, line.y2);
        ctx.strokeStyle = 'white'; // Цвет линии
        ctx.lineWidth = 3; // Толщина линии
        ctx.stroke();
    });
    // Вывод координат объекта в консоль
    console.log(`Координаты объекта: (${x.toFixed(2)} м, ${y.toFixed(2)} м)`);
}

// Функция для добавления точки
function addPoint(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    points.push({ x, y });
    if (points.length > 1) {
        const lastPoint = points[points.length - 2];
        const currentPoint = points[points.length - 1];
        lines.push({ x1: lastPoint.x, y1: lastPoint.y, x2: currentPoint.x, y2: currentPoint.y });
    }
    calculatePosition();
}

// Функция для очистки линий
function clearLines() {
    lines = [];
    points = [];
    calculatePosition();
}

// Функция для отмены последней линии
function undoLastLine() {
    if (lines.length > 0) {
        lines.pop();
        points.pop();
        calculatePosition();
    }
}

// Добавление обработчиков событий для рисования
canvas.addEventListener('click', addPoint);

// Добавляем обработчик события для кнопки очистки линий
document.getElementById('clearLines').addEventListener('click', clearLines);

// Добавляем обработчик события для кнопки отмены последней линии
document.getElementById('undoLastLine').addEventListener('click', undoLastLine);

// Добавление обработчиков событий для всех полей ввода
const inputs = document.querySelectorAll('#inputForm input');
inputs.forEach(input => {
    input.addEventListener('input', calculatePosition);
});

// Первоначальный расчет при загрузке страницы
calculatePosition();