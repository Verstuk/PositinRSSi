// Логика для модального окна
const helpIcon = document.getElementById('help-icon');
const modal = document.getElementById('modal');
const closeModal = document.getElementById('close-modal');

// Открыть модальное окно
helpIcon.addEventListener('click', () => {
    modal.style.display = 'flex';
});

// Закрыть модальное окно
closeModal.addEventListener('click', () => {
    modal.style.display = 'none';
});

// Закрыть модальное окно при клике вне его
window.addEventListener('click', (event) => {
    if (event.target === modal) {
        modal.style.display = 'none';
    }
});