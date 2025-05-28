document.getElementById('distanceForm').addEventListener('submit', function(event) {
    event.preventDefault();

    const rssi = parseFloat(document.getElementById('rssi').value);
    const txPower = parseFloat(document.getElementById('txPower').value);
    const n = parseFloat(document.getElementById('n').value);
    const obstacleLoss = parseFloat(document.getElementById('obstacleLoss').value);
    const snr = parseFloat(document.getElementById('snr').value);

    if (isNaN(rssi) || isNaN(txPower) || isNaN(n)) {
        alert("Пожалуйста, введите корректные значения.");
        return;
    }

    

    // Поправка на интерференцию
    const interferenceLoss = -10 * Math.log10(1 + 1 / snr);

    // Учет внешних факторов (препятствия и интерференция)
    const effectiveRSSI = rssi - obstacleLoss - interferenceLoss;

    // Формула для расчета расстояния
    const distance = Math.pow(10, (txPower - effectiveRSSI) / (10 * n));


    // Вывод результата
    document.getElementById('result').innerText = `Расстояние: ${distance.toFixed(2)} м`;
});