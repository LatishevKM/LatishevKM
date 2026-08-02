/**
 * Обход дерева модели Базис-Мебельщик (API ~5, Node.js v22).
 * Подключается через require из examples/, либо копируется в тело скрипта.
 */

/**
 * Рекурсивно обойти список объектов модели/блока.
 * @param {T3DObjectList} list
 * @param {(obj: any) => void} visitor
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

/**
 * Эвристика «это панель»: есть контур и толщина.
 * Надёжнее, чем полагаться на имя класса в разных сборках API.
 * @param {any} obj
 * @returns {boolean}
 */
function isPanel(obj) {
    return !!(
        obj &&
        obj.Contour &&
        typeof obj.Thickness === 'number'
    );
}

/**
 * Собрать все панели модели.
 * @param {T3DObjectList} model — обычно currentFileData.model
 * @returns {any[]}
 */
function collectPanels(model) {
    const panels = [];
    walkObjectList(model, (obj) => {
        if (isPanel(obj)) panels.push(obj);
    });
    return panels;
}

/**
 * Снять выделение и выделить переданные объекты.
 * @param {T3DObjectList} model
 * @param {any[]} objects
 */
function selectObjects(model, objects) {
    if (typeof model.UnPickAll === 'function') model.UnPickAll();
    else if (typeof model.UnSelectAll === 'function') model.UnSelectAll();

    for (let i = 0; i < objects.length; i++) {
        objects[i].Selected = true;
    }
}

module.exports = {
    walkObjectList,
    isPanel,
    collectPanels,
    selectObjects,
};
