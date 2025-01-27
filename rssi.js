/**
 * Функция для расчета уровня сигнала (RSSI) на основе расстояния с учетом внешних факторов.
 **/

document.getElementById('rssiForm').addEventListener('submit', function(event) {
    event.preventDefault();

    const distance1 = parseFloat(document.getElementById('distance1').value);
    const txPower1 = parseFloat(document.getElementById('txPower').value);
    const n1 = parseFloat(document.getElementById('n').value);
    const obstacleLoss1 = parseFloat(document.getElementById('obstacleLoss').value);
    const snr1 = parseFloat(document.getElementById('snr').value);

    if (isNaN(distance1) || isNaN(txPower1) || isNaN(n1)) {
        alert("Пожалуйста, введите корректные значения.");
        return;
    }
    // Поправка на интерференцию
    const interferenceLoss = -10 * Math.log10(1 + 1 / snr1);

    // Расчет RSSI по модели затухания сигнала
    const rssi = txPower1 - 10 * n1 * Math.log10(distance1) + obstacleLoss1 + interferenceLoss;

    document.getElementById('result1').innerText = `Уровень сигнала: ${rssi.toFixed(2)} dBm`;

});