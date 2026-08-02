/**
 * Базис-Мебельщик 2025 x64
 * Сценарий: обход всех панелей → сводка (имя, размер, толщина, кромка) → MessageBox / console.
 */

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
    if (panel.Butts && typeof panel.Butts.Count === 'number') return panel.Butts.Count;
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

function panelSizeMm(panel) {
    // GabMin/GabMax — габарит в ГСК; для габарита самой панели удобнее Contour.Min/Max
    try {
        const min = panel.Contour.Min;
        const max = panel.Contour.Max;
        const w = Math.abs(max.x - min.x);
        const h = Math.abs(max.y - min.y);
        return `${w.toFixed(1)} × ${h.toFixed(1)}`;
    } catch (e) {
        return '—';
    }
}

(function main() {
    const model = currentFileData && currentFileData.model;
    if (!model) {
        UI.dialogs.ErrorBox('Модель не открыта.');
        return;
    }

    const lines = [];
    let total = 0;
    let noButts = 0;

    walkObjectList(model, (obj) => {
        if (!isPanel(obj)) return;
        total++;
        const butts = getButtCount(obj);
        if (butts === 0) noButts++;
        const name = obj.Name || '(без имени)';
        const th = typeof obj.Thickness === 'number' ? obj.Thickness.toFixed(1) : '?';
        const line = `${total}. ${name} | ${panelSizeMm(obj)} | t=${th} | кромка=${butts}`;
        lines.push(line);
        console.log(line);
    });

    if (total === 0) {
        UI.dialogs.ErrorBox('В модели не найдено ни одной панели.');
        return;
    }

    const preview = lines.slice(0, 40).join('\r\n');
    const more = lines.length > 40 ? `\r\n… всего строк: ${lines.length}` : '';

    UI.dialogs.MessageBox(
        `Отчёт по панелям\r\n` +
            `Файл: ${currentFileData.filename || '—'}\r\n` +
            `Панелей: ${total}, без кромки: ${noButts}\r\n\r\n` +
            `${preview}${more}\r\n\r\n` +
            `(полный список также в консоли скрипта)`
    );
})();
