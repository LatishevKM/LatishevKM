/**
 * Базис-Мебельщик 2025 x64
 *
 * Проверка: внутренние горизонтальные панели (полки и т.п.)
 * не доходят до задней стенки после смены глубины корпуса.
 *
 * v1-логика:
 *  1) собрать панели модели (или выделенного блока, если есть Selected)
 *  2) найти «заднюю» — вертикальную панель у максимальной координаты по оси глубины
 *  3) для горизонтальных панелей посчитать зазор тыла до передней пласти задней
 *  4) если gap > MAX_GAP_MM — выделить и показать в отчёте
 *
 * Настрой под свой конструктор:
 *  - DEPTH_AXIS: 'x' | 'y' (ось глубины в ГСК для типовой постановки модели)
 *  - MAX_GAP_MM: допустимый зазор полки до задней
 *  - SKIP_NAME_RE: имена, которые пропускаем (ящики и т.п.)
 */

const DEPTH_AXIS = 'y'; // чаще глубина шкафа в Базисе — Y; поменяй при необходимости
const MAX_GAP_MM = 8; // всё, что больше — считаем «не доходит»
const SKIP_NAME_RE = /ящик|box|drawer|фасад|двер/i;

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

function axisOfNormal(panel) {
    // куда «смотрит» лицевая пласть в ГСК
    const n = panel.NToGlobal(AxisZ);
    const ax = Math.abs(n.x);
    const ay = Math.abs(n.y);
    const az = Math.abs(n.z);
    if (ax >= ay && ax >= az) return 'x';
    if (ay >= ax && ay >= az) return 'y';
    return 'z';
}

function gab(panel) {
    return {
        min: panel.GabMin,
        max: panel.GabMax,
    };
}

function center(panel) {
    const g = gab(panel);
    return {
        x: (g.min.x + g.max.x) / 2,
        y: (g.min.y + g.max.y) / 2,
        z: (g.min.z + g.max.z) / 2,
    };
}

function selectObjects(model, objects) {
    if (typeof model.UnPickAll === 'function') model.UnPickAll();
    else if (typeof model.UnSelectAll === 'function') model.UnSelectAll();
    for (let i = 0; i < objects.length; i++) objects[i].Selected = true;
}

function shouldSkip(panel) {
    const name = panel.Name || '';
    return SKIP_NAME_RE.test(name);
}

/**
 * Передняя (внутренняя) координата задней стенки по оси глубины.
 * Считаем, что «лицо» корпуса — меньшая координата по DEPTH_AXIS,
 * «тыл» — большая. Тогда внутренняя пласть задней ≈ min по этой оси у задней панели.
 * Если у тебя модель зеркально — инвертируй BACK_FACES_SMALLER.
 */
const BACK_INNER_IS_MIN = true;

function backInnerCoord(backPanel) {
    const g = gab(backPanel);
    return BACK_INNER_IS_MIN ? g.min[DEPTH_AXIS] : g.max[DEPTH_AXIS];
}

function panelRearCoord(panel) {
    // тыл внутреннего элемента — край, ближайший к задней (= больший по оси глубины)
    const g = gab(panel);
    return BACK_INNER_IS_MIN ? g.max[DEPTH_AXIS] : g.min[DEPTH_AXIS];
}

function collectPanels(root) {
    const panels = [];
    walkObjectList(root, (obj) => {
        if (isPanel(obj)) panels.push(obj);
    });
    return panels;
}

(function main() {
    const model = currentFileData && currentFileData.model;
    if (!model) {
        UI.dialogs.ErrorBox('Модель не открыта.');
        return;
    }

    // Если что-то выделено и у объекта есть List — обходим его как модуль.
    // Иначе — всю модель.
    let root = model;
    const selected = model.Selected || model.SelectedObj;
    if (selected && selected.List) root = selected;

    const panels = collectPanels(root);
    if (!panels.length) {
        UI.dialogs.ErrorBox('Панели не найдены.');
        return;
    }

    // Кандидаты в «заднюю»: нормаль вдоль оси глубины
    const backCandidates = panels.filter((p) => axisOfNormal(p) === DEPTH_AXIS);
    if (!backCandidates.length) {
        UI.dialogs.ErrorBox(
            `Не найдена панель с нормалью по оси глубины (${DEPTH_AXIS}).\n` +
                'Поменяй DEPTH_AXIS в начале скрипта.'
        );
        return;
    }

    // Берём самую «заднюю» по центру габарита
    backCandidates.sort((a, b) => {
        const ca = center(a)[DEPTH_AXIS];
        const cb = center(b)[DEPTH_AXIS];
        return BACK_INNER_IS_MIN ? cb - ca : ca - cb;
    });
    const back = backCandidates[0];
    const backPlane = backInnerCoord(back);

    // Внутренние: горизонтальные (нормаль ≈ Z), не задняя, не пропущенные по имени
    const internals = panels.filter((p) => {
        if (p === back) return false;
        if (shouldSkip(p)) return false;
        return axisOfNormal(p) === 'z';
    });

    const problems = [];
    for (let i = 0; i < internals.length; i++) {
        const panel = internals[i];
        const rear = panelRearCoord(panel);
        // не доходит: тыл панели не дотягивает до внутренней пласти задней
        const gap = BACK_INNER_IS_MIN
            ? backPlane - rear
            : rear - backPlane;

        if (gap > MAX_GAP_MM) {
            problems.push({
                panel,
                gap,
                name: panel.Name || '(без имени)',
            });
        }
    }

    selectObjects(
        model,
        problems.map((p) => p.panel)
    );

    if (!problems.length) {
        UI.dialogs.MessageBox(
            `Проверка зазора до задней стенки\r\n` +
                `Задняя: "${back.Name || '(без имени)'}"\r\n` +
                `Горизонтальных внутри: ${internals.length}\r\n` +
                `Проблем не найдено (допуск ${MAX_GAP_MM} мм).`
        );
        return;
    }

    problems.sort((a, b) => b.gap - a.gap);
    const lines = problems
        .slice(0, 40)
        .map(
            (p, idx) =>
                `${idx + 1}. ${p.name} — зазор ${p.gap.toFixed(1)} мм`
        )
        .join('\r\n');
    const more =
        problems.length > 40 ? `\r\n… и ещё ${problems.length - 40}` : '';

    UI.dialogs.MessageBox(
        `Не доходят до задней "${back.Name || ''}"\r\n` +
            `Проблемных: ${problems.length} (допуск ${MAX_GAP_MM} мм)\r\n\r\n` +
            `${lines}${more}\r\n\r\n` +
            `Эти панели выделены в модели.`
    );
})();
