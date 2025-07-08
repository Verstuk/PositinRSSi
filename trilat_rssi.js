// === Динамическое добавление меток ===
const beaconsContainer = document.getElementById("beaconsContainer");
const addBeaconBtn = document.getElementById("addBeacon");
const resultsDiv = document.getElementById("results");
const canvas = document.getElementById("room");
const ctx = canvas.getContext("2d");

let beacons = [];
let beaconId = 0;

function createBeaconRow(beacon = {}) {
  beaconId++;
  const row = document.createElement("div");
  row.className = "beacon-row";
  row.innerHTML = `
        <input type="text" placeholder="Название" class="beacon-name" value="${
          beacon.name || ""
        }" required>
        <input type="number" step="any" placeholder="X (м)" class="beacon-x" value="${
          beacon.x || ""
        }" required>
        <input type="number" step="any" placeholder="Y (м)" class="beacon-y" value="${
          beacon.y || ""
        }" required>
        <input type="number" step="any" placeholder="RSSI (дБм)" class="beacon-rssi" value="${
          beacon.rssi || ""
        }" required>
        <button type="button" class="remove-beacon">✕</button>
    `;
  row.querySelector(".remove-beacon").onclick = () => {
    row.remove();
    updateBeaconsFromDOM();
  };
  row.querySelectorAll("input").forEach((input) => {
    input.oninput = updateBeaconsFromDOM;
  });
  return row;
}

function updateBeaconsFromDOM() {
  beacons = [];
  beaconsContainer.querySelectorAll(".beacon-row").forEach((row) => {
    const name = row.querySelector(".beacon-name").value;
    const x = parseFloat(row.querySelector(".beacon-x").value);
    const y = parseFloat(row.querySelector(".beacon-y").value);
    const rssi = parseFloat(row.querySelector(".beacon-rssi").value);
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
  const effectiveRSSI = rssi - obstacleLoss;
  // Формула для расчета расстояния
  return Math.pow(10, (txPower - effectiveRSSI) / (10 * n));
}

// === LLS ===
function llsTrilateration(markers) {
  if (markers.length < 3) return null;
  const sorted = [...markers].sort((a, b) => a.dist - b.dist);
  const [A, B, C] = sorted;
  const x1 = A.x,
    y1 = A.y;
  const x2 = B.x,
    y2 = B.y;
  const x3 = C.x,
    y3 = C.y;
  const d1 = A.dist,
    d2 = B.dist,
    d3 = C.dist;
  const S = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
  if (Math.abs(S) < 1e-8) return null;
  const x =
    ((d1 * d1 - d2 * d2 + x2 * x2 - x1 * x1 + y2 * y2 - y1 * y1) * (y3 - y1) -
      (d1 * d1 - d3 * d3 + x3 * x3 - x1 * x1 + y3 * y3 - y1 * y1) * (y2 - y1)) /
    S;
  const y =
    ((d1 * d1 - d3 * d3 + x3 * x3 - x1 * x1 + y3 * y3 - y1 * y1) * (x2 - x1) -
      (d1 * d1 - d2 * d2 + x2 * x2 - x1 * x1 + y2 * y2 - y1 * y1) * (x3 - x1)) /
    S;
  return { x, y };
}

// === WLS ===
function wlsTrilateration(markers) {
  if (markers.length < 3) return null;
  let sumW = 0,
    x = 0,
    y = 0;
  for (const m of markers) {
    const w = 1 / (m.dist * m.dist + 1e-8);
    sumW += w;
    x += m.x * w;
    y += m.y * w;
  }
  return { x: x / sumW, y: y / sumW };
}

// === WLS ===
// Пример с math.js
function wlsTrilaterationMatrix(markers, p, epsilon = 1e-6) {
  if (markers.length < 3) return null;

  // Сортируем маяки по возрастанию дистанции
  const sortedBeacons = [...markers].sort((a, b) => a.dist - b.dist);
  const base = sortedBeacons[0]; // Базовый маяк (ближайший)

  const A = [];
  const b = [];
  const weights = [];

  // Предварительно вычисляем веса для каждого маяка (кроме базового)
  for (let i = 1; i < sortedBeacons.length; i++) {
    const di = sortedBeacons[i].dist;
    // Вес = 1 / (d_i^2 + epsilon) для избежания деления на 0
    const weight = 1 / (Math.pow(di, p) + epsilon);
    weights.push(weight);
  }

  // Формируем матрицу A и вектор b с учетом весов
  for (let i = 1; i < sortedBeacons.length; i++) {
    const beacon = sortedBeacons[i];
    const xi = beacon.x;
    const yi = beacon.y;
    const di = beacon.dist;

    const x0 = base.x;
    const y0 = base.y;
    const d0 = base.dist;

    // Компоненты уравнения
    const ai = xi - x0;
    const bi = yi - y0;
    const ci =
      0.5 * (xi * xi + yi * yi - di * di - (x0 * x0 + y0 * y0 - d0 * d0));

    // Применяем вес: умножаем на sqrt(w_i)
    const weightFactor = Math.sqrt(weights[i - 1]);
    A.push([ai * weightFactor, bi * weightFactor]);
    b.push(ci * weightFactor);
  }

  // Решение через нормальные уравнения с весами
  const At = math.transpose(A);
  const AtA = math.multiply(At, A);
  const Atb = math.multiply(At, b);
  const solution = math.lusolve(AtA, Atb);

  return {
    x: solution[0][0],
    y: solution[1][0],
    calculations: {
      A: formatMatrixForMathJax(A),
      b: formatMatrixForMathJax(b),
      At: formatMatrixForMathJax(At),
      AtA: formatMatrixForMathJax(AtA),
      Atb: formatMatrixForMathJax(Atb),
      solution: formatMatrixForMathJax(solution),
    }, // Опционально: промежуточные матрицы
  };
}

// === NLS (Левенберг-Марквардт) ===
/**
 * Выполняет трилатерацию методом Левенберга-Марквардта
 * @param {Array} markers - Массив маркеров {x, y, dist}
 * @param {Array} initialGuess - Начальное приближение [x, y] (опционально)
 * @param {number} maxIterations - Макс. число итераций (по умолчанию 1000)
 * @param {number} tolerance - Допустимая погрешность (по умолчанию 1e-6)
 * @returns {Object|null} Координаты {x, y} или null при ошибке
 */
function nlsTrilateration(
  markers,
  initialGuess = null,
  maxIterations = 10000,
  tolerance = 1e-6
) {
  // Проверка минимального количества маркеров
  if (markers.length < 3) return null;

  // Инициализация начальной точки
  let x;
  if (
    initialGuess &&
    Array.isArray(initialGuess) &&
    initialGuess.length === 2
  ) {
    x = [...initialGuess]; // Использование пользовательского приближения
  } else {
    // Рассчет центроида как начального приближения
    x = markers.reduce((acc, b) => [acc[0] + b.x, acc[1] + b.y], [0, 0]);
    x = [x[0] / markers.length, x[1] / markers.length];
  }

  let lambda = 0.001; // Параметр регуляризации
  let iter = 0; // Счетчик итераций
  let delta = [Infinity, Infinity]; // Вектор изменения координат

  // Главный цикл оптимизации
  while (
    iter < maxIterations &&
    (Math.abs(delta[0]) > tolerance || Math.abs(delta[1]) > tolerance)
  ) {
    // 1. Расчет невязок (разница между расчетным и реальным расстоянием)
    const residuals = markers.map((b) => {
      const dx = x[0] - b.x;
      const dy = x[1] - b.y;
      const r = Math.sqrt(dx * dx + dy * dy) || 1e-8; // Евклидово расстояние (защита от 0)
      return r - b.dist; // Ошибка для текущего маркера
    });

    // 2. Построение матрицы Якоби (частные производные)
    const J = markers.map((b) => {
      const dx = x[0] - b.x;
      const dy = x[1] - b.y;
      const r = Math.sqrt(dx * dx + dy * dy) || 1e-8;
      // Производные d(residual)/dx и d(residual)/dy
      return [dx / r, dy / r]; // Единичный вектор направления
    });

    // 3. Транспонирование матрицы Якоби (JT)
    const JT = J[0].map((_, i) => J.map((row) => row[i]));

    // 4. Расчет матрицы JT*J (гессиан)
    const JTJ = [
      [
        JT[0].reduce((acc, val, i) => acc + val * J[i][0], 0), // JTJ[0][0]
        JT[0].reduce((acc, val, i) => acc + val * J[i][1], 0), // JTJ[0][1]
      ],
      [
        JT[1].reduce((acc, val, i) => acc + val * J[i][0], 0), // JTJ[1][0]
        JT[1].reduce((acc, val, i) => acc + val * J[i][1], 0), // JTJ[1][1]
      ],
    ];

    // 5. Регуляризация гессиана (добавление lambda к диагонали)
    JTJ[0][0] += lambda;
    JTJ[1][1] += lambda;

    // 6. Расчет вектора JT * residuals
    const JTr = [
      JT[0].reduce((acc, val, i) => acc + val * residuals[i], 0),
      JT[1].reduce((acc, val, i) => acc + val * residuals[i], 0),
    ].map((v) => -v); // Смена знака для направления коррекции

    // 7. Решение системы уравнений (JTJ + lambda*I) * delta = -JTr
    const determinant = JTJ[0][0] * JTJ[1][1] - JTJ[0][1] * JTJ[1][0];
    if (Math.abs(determinant) < 1e-12) break; // Защита от вырожденной матрицы

    // Формулы Крамера для решения 2x2:
    delta = [
      (JTJ[1][1] * JTr[0] - JTJ[0][1] * JTr[1]) / determinant,
      (-JTJ[1][0] * JTr[0] + JTJ[0][0] * JTr[1]) / determinant,
    ];

    // 8. Обновление позиции
    x[0] += delta[0];
    x[1] += delta[1];

    // 9. Адаптация параметра регуляризации (уменьшение при успешном шаге)
    lambda *= 0.9;
    iter++;
  }

  return { x: x[0], y: x[1] }; // Возврат результата
}

// === Panzoom: масштабирование и перемещение canvas ===
const panzoomInstance = Panzoom(canvas, {
  maxScale: 10,
  minScale: 0.1,
  contain: "outside",
});
canvas.parentElement.addEventListener("wheel", panzoomInstance.zoomWithWheel);

// === Визуализация (аналогично trilateration.js, с инверсией Y) ===
function drawAllCircles(markers) {
  if (markers.length < 3) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Находим min/max с учетом радиусов
  let minX = markers[0].x - markers[0].dist,
    maxX = markers[0].x + markers[0].dist;
  let minY = markers[0].y - markers[0].dist,
    maxY = markers[0].y + markers[0].dist;
  markers.forEach((m) => {
    minX = Math.min(minX, m.x - m.dist);
    maxX = Math.max(maxX, m.x + m.dist);
    minY = Math.min(minY, m.y - m.dist);
    maxY = Math.max(maxY, m.y + m.dist);
  });
  // Центр координат (0,0) — центр canvas
  const centerCanvasX = canvas.width / 2 - 100;
  const centerCanvasY = canvas.height / 2;
  // Находим максимальное отклонение от (0,0) по X и Y
  const maxAbsX = Math.max(Math.abs(minX), Math.abs(maxX));
  const maxAbsY = Math.max(Math.abs(minY), Math.abs(maxY));
  // Масштаб: чтобы всё влезло с запасом
  const padding = 40;
  const scaleX = (canvas.width / 2 - padding) / maxAbsX;
  const scaleY = (canvas.height / 2 - padding) / maxAbsY;
  const scaleDraw = Math.min(scaleX, scaleY);
  // Функция перевода координат в canvas
  function toCanvas(x, y) {
    return [centerCanvasX + x * scaleDraw, centerCanvasY - y * scaleDraw];
  }
  // Рисуем окружности и точки
  markers.forEach((m) => {
    const [cx, cy] = toCanvas(m.x, m.y);
    ctx.beginPath();
    ctx.arc(cx, cy, m.dist * scaleDraw, 0, 2 * Math.PI);
    ctx.strokeStyle = "rgba(255,0,0,0.4)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, 2 * Math.PI);
    ctx.fillStyle = "red";
    ctx.fill();
    ctx.font = "12px Arial";
    ctx.fillStyle = "white";
    ctx.fillText(m.name, cx + 8, cy - 8);
  });
  // Возвращаем функцию перевода и масштаб для других элементов
  return { toCanvas, scaleDraw };
}

function drawMethodPoint(point, toCanvas, scaleDraw, color, label) {
  if (!point) return;
  const [cx, cy] = toCanvas(point.x, point.y);
  ctx.beginPath();
  ctx.arc(cx, cy, 7, 0, 2 * Math.PI);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.font = "bold 14px Arial";
  ctx.fillStyle = color;
  ctx.fillText(label, cx + 10, cy);
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
    { x: xs2, y: ys2 },
  ];
}

function drawIntersections(markers, toCanvas, scaleDraw) {
  for (let i = 0; i < markers.length; i++) {
    for (let j = i + 1; j < markers.length; j++) {
      const p1 = markers[i];
      const p2 = markers[j];
      const r1 = markers[i].dist * scaleDraw;
      const r2 = markers[j].dist * scaleDraw;
      const inters = circleIntersections(
        p1,
        r1 / scaleDraw,
        p2,
        r2 / scaleDraw
      );
      inters.forEach((pt, idx) => {
        const [cx, cy] = toCanvas(pt.x, pt.y);
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, 2 * Math.PI);
        ctx.fillStyle = "lime";
        ctx.fill();
        ctx.font = "12px Arial";
        ctx.fillStyle = "lime";
        ctx.fillText(`I${i + 1}${j + 1}.${idx + 1}`, cx + 8, cy);
      });
    }
  }
}

// === Основной обработчик ===
document.getElementById("calcTrilatRssi").onclick = () => {
  updateBeaconsFromDOM();
  if (beacons.length < 3) {
    resultsDiv.innerHTML = "Добавьте минимум 3 метки.";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  // Получаем параметры среды
  const txPower = parseFloat(document.getElementById("txPower").value);
  const n = parseFloat(document.getElementById("n").value);
  const obstacleLoss = parseFloat(
    document.getElementById("obstacleLoss").value
  );
  const snr = parseFloat(document.getElementById("snr").value);
  const p = parseFloat(document.getElementById("power").value);
  // Считаем расстояния для каждой метки
  const markers = beacons.map((b) => ({
    name: b.name,
    x: b.x,
    y: b.y,
    dist: rssiToDistance(b.rssi, txPower, n, obstacleLoss, snr),
  }));
  // Проверка валидности
  let invalids = markers.filter(
    (m) => isNaN(m.x) || isNaN(m.y) || isNaN(m.dist) || m.dist <= 0
  );
  if (invalids.length > 0) {
    resultsDiv.innerHTML = "Проверьте значения всех меток и параметров среды.";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    console.warn("Некорректные метки:", invalids);
    return;
  }
  let res = `<div class="calculation-results">`;
  res += `<h3>Результаты трилатерации:</h3>`;

  const lls = llsTrilaterationMatrix(markers);
  const wls = wlsTrilaterationMatrix(markers, p);
  const nls = nlsTrilateration(markers);
  let llsResiduals = "";
  if (lls) {
    const sorted = [...markers].sort((a, b) => a.dist - b.dist);
    const [A, B, C] = sorted;
    const dists = [A, B, C].map((m) => {
      const d = Math.sqrt((lls.x - m.x) ** 2 + (lls.y - m.y) ** 2);
      return d;
    });
    llsResiduals =
      "<p><b>Остатки (LLS):</b></p>" +
      dists
        .map(
          (d, i) =>
            `<p>Метка ${i + 1}: ${d.toFixed(2)} м (ожидалось ${[A, B, C][
              i
            ].dist.toFixed(2)} м)</p>`
        )
        .join("");
  }
  // В функции, где формируются результаты
  res += `<div class="results-container">`; // Главный контейнер для всех методов

  // LLS Блок
  res += `<div class="method-block lls-block">`;
  res += `<h4>LLS Метод:</h4>`;
  res += `<p>Координаты: ${
    lls ? `${lls.x.toFixed(15)}, ${lls.y.toFixed(15)}` : "Ошибка/Коллинеарность"
  }</p>`;
  res += llsResiduals;

  // Отображение промежуточных расчетов LLS
  if (lls && lls.calculations) {
    res += `<p>Промежуточные расчеты LLS:</p>`;
    res += `<div class="math-formula"><p>Матрица A: \\[${lls.calculations.A}\\]</p></div>`;
    res += `<div class="math-formula"><p>Вектор b: \\[${lls.calculations.b}\\]</p></div>`;
    res += `<div class="math-formula"><p>Транспонированная матрица A (A^T): \\[${lls.calculations.At}\\]</p></div>`;
    res += `<div class="math-formula"><p>Произведение A^TA: \\[${lls.calculations.AtA}\\]</p></div>`;
    res += `<div class="math-formula"><p>Произведение A^Tb: \\[${lls.calculations.Atb}\\]</p></div>`;
    res += `<div class="math-formula"><p>Решение (x, y): \\[${lls.calculations.solution}\\]</p></div>`;
  }
  res += `</div>`; // Закрываем LLS блок

  // WLS Блок
  res += `<div class="method-block wls-block">`;
  res += `<h4>WLS Метод:</h4>`;
  res += `<p>Координаты: ${
    wls ? `${wls.x.toFixed(15)}, ${wls.y.toFixed(15)}` : "Ошибка"
  }</p>`;

  // Отображение промежуточных расчетов WLS
  if (wls && wls.calculations) {
    res += `<p>Промежуточные расчеты WLS:</p>`;
    res += `<div class="math-formula"><p>Матрица A: \\[${wls.calculations.A}\\]</p></div>`;
    res += `<div class="math-formula"><p>Вектор b: \\[${wls.calculations.b}\\]</p></div>`;
    res += `<div class="math-formula"><p>Транспонированная матрица A (A^T): \\[${wls.calculations.At}\\]</p></div>`;
    res += `<div class="math-formula"><p>Произведение A^TA: \\[${wls.calculations.AtA}\\]</p></div>`;
    res += `<div class="math-formula"><p>Произведение A^Tb: \\[${wls.calculations.Atb}\\]</p></div>`;
    res += `<div class="math-formula"><p>Решение (x, y): \\[${wls.calculations.solution}\\]</p></div>`;
  }
  res += `</div>`; // Закрываем WLS блок

  // NLS Блок
  res += `<div class="method-block nls-block">`;
  res += `<h4>NLS Метод:</h4>`;
  res += `<p>Координаты: ${
    nls ? `${nls.x.toFixed(15)}, ${nls.y.toFixed(15)}` : "Ошибка"
  }</p>`;
  res += `</div>`; //Закрываем NLS блок

  res += `</div>`; // Закрываем главный контейнер
  res += `</div>`; // Close calculation-results

  resultsDiv.innerHTML = res;
  const drawParams = drawAllCircles(markers);
  if (drawParams) {
    drawMethodPoint(
      lls,
      drawParams.toCanvas,
      drawParams.scaleDraw,
      "blue",
      "LLS"
    );
    drawMethodPoint(
      wls,
      drawParams.toCanvas,
      drawParams.scaleDraw,
      "orange",
      "WLS"
    );
    drawMethodPoint(
      nls,
      drawParams.toCanvas,
      drawParams.scaleDraw,
      "purple",
      "NLS"
    );
    drawIntersections(markers, drawParams.toCanvas, drawParams.scaleDraw);
  }
  MathJax.typesetPromise([resultsDiv]);
  console.log("resultsDiv innerHTML:", resultsDiv.innerHTML);
};

// Вспомогательная функция для форматирования матриц в MathJax
function formatMatrixForMathJax(matrix) {
  if (!matrix || matrix.length === 0) return "";

  // Проверяем, является ли это одномерным массивом (вектором)
  if (!Array.isArray(matrix[0])) {
    const rows = matrix.map((val) => val);
    return `\\begin{pmatrix}${rows.join("\\\\")}\\end{pmatrix}`;
  } else {
    // Это двумерный массив (матрица)
    const rows = matrix.map((row) => {
      return row.map((val) => val).join(" & ");
    });
    return `\\begin{pmatrix}${rows.join("\\\\")}\\end{pmatrix}`;
  }
}

// Пример с math.js
function llsTrilaterationMatrix(markers) {
  if (markers.length < 3) return null;

  // Сортируем маяки по возрастанию дистанции
  const sortedBeacons = [...markers].sort((a, b) => a.dist - b.dist);

  // Базовая точка (можно брать первую или ближайшую)
  const base = sortedBeacons[0];
  const A = [];
  const b = [];
  for (let i = 1; i < markers.length; i++) {
    const xi = sortedBeacons[i].x,
      yi = sortedBeacons[i].y,
      di = sortedBeacons[i].dist;
    const x0 = base.x,
      y0 = base.y,
      d0 = base.dist;
    A.push([xi - x0, yi - y0]);
    b.push(
      0.5 *
        (Math.pow(xi, 2) +
          Math.pow(yi, 2) -
          Math.pow(di, 2) -
          (Math.pow(x0, 2) + Math.pow(y0, 2) - Math.pow(d0, 2)))
    );
  }
  // Решение через псевдообратную (на случай переопределённой системы)
  const At = math.transpose(A);
  const AtA = math.multiply(At, A);
  const Atb = math.multiply(At, b);
  const solution = math.lusolve(AtA, Atb);

  const result = {
    x: solution[0][0],
    y: solution[1][0],
    calculations: {
      A: formatMatrixForMathJax(A),
      b: formatMatrixForMathJax(b),
      At: formatMatrixForMathJax(At),
      AtA: formatMatrixForMathJax(AtA),
      Atb: formatMatrixForMathJax(Atb),
      solution: formatMatrixForMathJax(solution),
    },
  };
  return result;
}
