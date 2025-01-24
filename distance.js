document.getElementById('distanceForm').addEventListener('submit', function(event) {
    event.preventDefault();

    const rssi = parseFloat(document.getElementById('rssi').value);
    const txPower = parseFloat(document.getElementById('txPower').value);
    const n = parseFloat(document.getElementById('n').value);

    if (isNaN(rssi) || isNaN(txPower) || isNaN(n)) {
        alert("Пожалуйста, введите корректные значения.");
        return;
    }

    // Формула для расчета расстояния
    const distance = Math.pow(10, (txPower - rssi) / (10 * n));

    console.log(distance);

    // Вывод результата
    document.getElementById('result').innerText = `Расстояние: ${distance.toFixed(2)} м`;
});