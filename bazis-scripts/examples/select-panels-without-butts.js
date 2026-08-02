/**
 * Базис-Мебельщик 2025 x64
 * Сценарий: обойти модель → найти панели без кромки → выделить → показать отчёт.
 *
 * Запуск: вставить во встроенный редактор скриптов или открыть файл из панели скриптов.
 * Если require('./…') в твоей сборке не резолвит путь — скопируй функции из lib/ в этот файл.
 */

// --- helpers (дублируют lib/, чтобы скрипт был самодостаточным) ---

function walkObjectList(list, visitor) {
    if (!list || typeof list.Count !== 'number') return;
    for (let i = 0; i < list.Count; i++) {
        const obj = list.Objects[i];
        if (!obj) continue;
        visitor(obj);
        if (obj.List) walkObjectList(obj, visitor);
    }
}

function isPanel(obj) {
    return !!(obj && obj.Contour && typeof obj.Thickness === 'number');
}

function getButtCount(panel) {
    if (!panel) return 0;
    if (panel.Butts && typeof panel.Butts.Count === 'number') {
        return panel.Butts.Count;
    }
    let count = 0;
    const contour = panel.Contour;
    if (!contour || typeof contour.Count !== 'number') return 0;
    for (let i = 0; i < contour.Count; i++) {
        const el = contour.Objects ? contour.Objects[i] : null;
        if (!el) continue;
        if (el.Butt || el.ButtMaterial || el.Edge || el.EdgeMaterial) count++;
        else if (typeof el.HasButt === 'boolean' && el.HasButt) count++;
    }
    return count;
}

function selectObjects(model, objects) {
    if (typeof model.UnPickAll === 'function') model.UnPickAll();
    else if (typeof model.UnSelectAll === 'function') model.UnSelectAll();
    for (let i = 0; i < objects.length; i++) objects[i].Selected = true;
}

// --- main ---

(function main() {
    const model = currentFileData && currentFileData.model;
    if (!model) {
        UI.dialogs.ErrorBox('Модель не открыта.');
        return;
    }

    const withoutButts = [];
    let totalPanels = 0;

    walkObjectList(model, (obj) => {
        if (!isPanel(obj)) return;
        totalPanels++;
        if (getButtCount(obj) === 0) withoutButts.push(obj);
    });

    if (totalPanels === 0) {
        UI.dialogs.ErrorBox('В модели не найдено ни одной панели.');
        return;
    }

    selectObjects(model, withoutButts);

    const names = withoutButts
        .slice(0, 30)
        .map((p, idx) => `${idx + 1}. ${p.Name || '(без имени)'}`)
        .join('\r\n');

    const more =
        withoutButts.length > 30
            ? `\r\n… и ещё ${withoutButts.length - 30}`
            : '';

    UI.dialogs.MessageBox(
        `Панелей всего: ${totalPanels}\r\n` +
            `Без кромки: ${withoutButts.length}\r\n\r\n` +
            (withoutButts.length
                ? `Выделены:\r\n${names}${more}`
                : 'Все панели имеют облицовку кромки.')
    );
})();
