const canvas = document.getElementById('room');
const ctx = canvas.getContext('2d');
const scale = 50; // Масштаб: 1 метр = 50 пикселей

document.getElementById('width').value = '20';
document.getElementById('length').value = '10';
document.getElementById('marker1X').value = '0';
document.getElementById('marker1Y').value = '0';
document.getElementById('rssi1').value = '-60';
document.getElementById('marker2X').value = '10';
document.getElementById('marker2Y').value = '0';
document.getElementById('rssi2').value = '-70';
document.getElementById('marker3X').value = '0';
document.getElementById('marker3Y').value = '10';
document.getElementById('rssi3').value = '-65';

let points = [];
let lines = [];

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