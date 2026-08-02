/**
 * Базис-Мебельщик 2025 x64
 * Сценарий: расставить позиции/обозначения на все объекты модели.
 * Основано на официальном примере API arrangePositions.
 */

(function main() {
    const model = currentFileData && currentFileData.model;
    if (!model) {
        UI.dialogs.ErrorBox('Модель не открыта.');
        return;
    }

    const arranger = arrangePositions.NewArranger();
    arranger.parameters.arrangeMode = arrangePositions.ArrangeMode.allObjects;
    arranger.parameters.designationPrefix = currentFileData.article
        ? currentFileData.article.ShortSign
        : '';
    arranger.parameters.list = model;
    arranger.parameters.options.LoadFromSettings();
    arranger.parameters.selectedOnly = false;

    if (arranger.ArrangeObjects()) {
        historyOperations.CommitCurrentChanges('Скрипт: расстановка позиций');
        UI.dialogs.MessageBox('Расстановка позиций выполнена успешно.');
    } else {
        UI.dialogs.ErrorBox('Расстановка позиций не выполнена.');
    }
})();
