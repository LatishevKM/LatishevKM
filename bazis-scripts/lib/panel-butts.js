/**
 * Проверка облицовки кромки панели.
 * В разных версиях API кромка может лежать в panel.Butts
 * или на элементах контура — проверяем оба варианта.
 */

/**
 * @param {any} panel
 * @returns {number} количество рёбер с кромкой
 */
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
        // типичные поля в разных сборках
        if (el.Butt || el.ButtMaterial || el.Edge || el.EdgeMaterial) {
            count++;
            continue;
        }
        if (typeof el.HasButt === 'boolean' && el.HasButt) {
            count++;
        }
    }
    return count;
}

/**
 * Панель без какой-либо облицовки кромки.
 * @param {any} panel
 * @returns {boolean}
 */
function hasNoButts(panel) {
    return getButtCount(panel) === 0;
}

/**
 * Панель с неполной кромкой: есть контур, но не все рёбра облицованы.
 * @param {any} panel
 * @returns {boolean}
 */
function hasIncompleteButts(panel) {
    if (!panel || !panel.Contour) return false;
    const edgeCount = panel.Contour.Count;
    if (!edgeCount) return false;
    const butts = getButtCount(panel);
    return butts > 0 && butts < edgeCount;
}

module.exports = {
    getButtCount,
    hasNoButts,
    hasIncompleteButts,
};
