/**
 * Базис-Мебельщик 2025 x64
 *
 * Проверка: внутренние элементы не доходят до задней стенки
 * после смены глубины корпуса.
 *
 * Кандидаты:
 *  - полки / горизонтальные панели (нормаль ≈ Z)
 *  - вертикальные стойки (нормаль ≈ ось ширины, но НЕ крайние бока)
 *
 * Не кандидаты: бока, задняя, фасады, ящики (по имени).
 *
 * Настройки:
 *  - DEPTH_AXIS: 'x' | 'y'
 *  - MAX_GAP_MM: допуск зазора
 *  - SIDE_EDGE_TOL_MM: насколько близко к краю ширины считать панель боком
 *  - SKIP_NAME_RE: что пропускать
 */

const DEPTH_AXIS = 'y';
const MAX_GAP_MM = 8;
const SIDE_EDGE_TOL_MM = 2; // панель у края габарита по ширине = бок, не стойка
const SKIP_NAME_RE = /ящик|box|drawer|фасад|двер/i;
const BACK_INNER_IS_MIN = true; // лицо корпуса на меньших координатах по DEPTH_AXIS

const WIDTH_AXIS = DEPTH_AXIS === 'y' ? 'x' : 'y';

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
    const n = panel.NToGlobal(AxisZ);
    const ax = Math.abs(n.x);
    const ay = Math.abs(n.y);
    const az = Math.abs(n.z);
    if (ax >= ay && ax >= az) return 'x';
    if (ay >= ax && ay >= az) return 'y';
    return 'z';
}

function gab(panel) {
    return { min: panel.GabMin, max: panel.GabMax };
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
    return SKIP_NAME_RE.test(panel.Name || '');
}

function backInnerCoord(backPanel) {
    const g = gab(backPanel);
    return BACK_INNER_IS_MIN ? g.min[DEPTH_AXIS] : g.max[DEPTH_AXIS];
}

function panelRearCoord(panel) {
    const g = gab(panel);
    return BACK_INNER_IS_MIN ? g.max[DEPTH_AXIS] : g.min[DEPTH_AXIS];
}

function gapToBack(panel, backPlane) {
    const rear = panelRearCoord(panel);
    return BACK_INNER_IS_MIN ? backPlane - rear : rear - backPlane;
}

function collectPanels(root) {
    const panels = [];
    walkObjectList(root, (obj) => {
        if (isPanel(obj)) panels.push(obj);
    });
    return panels;
}

/**
 * Габарит модуля по ширине — по всем панелям с нормалью ширины
 * (бока + стойки). Края этого габарита = бока.
 */
function widthExtent(widthPanels) {
    let minW = Infinity;
    let maxW = -Infinity;
    for (let i = 0; i < widthPanels.length; i++) {
        const g = gab(widthPanels[i]);
        if (g.min[WIDTH_AXIS] < minW) minW = g.min[WIDTH_AXIS];
        if (g.max[WIDTH_AXIS] > maxW) maxW = g.max[WIDTH_AXIS];
    }
    return { minW, maxW };
}

function isSidePanel(panel, minW, maxW) {
    const g = gab(panel);
    const nearMin = Math.abs(g.min[WIDTH_AXIS] - minW) <= SIDE_EDGE_TOL_MM;
    const nearMax = Math.abs(g.max[WIDTH_AXIS] - maxW) <= SIDE_EDGE_TOL_MM;
    return nearMin || nearMax;
}

/**
 * @returns {{ panel: any, role: string, gap: number, name: string }[]}
 */
function findProblems(panels, back, backPlane) {
    const widthPanels = panels.filter(
        (p) => p !== back && axisOfNormal(p) === WIDTH_AXIS && !shouldSkip(p)
    );
    const { minW, maxW } = widthExtent(widthPanels);

    const candidates = [];

    // Полки / горизонталь
    for (let i = 0; i < panels.length; i++) {
        const p = panels[i];
        if (p === back || shouldSkip(p)) continue;
        if (axisOfNormal(p) === 'z') {
            candidates.push({ panel: p, role: 'полка' });
        }
    }

    // Стойки: та же ориентация, что бока, но не на краю ширины
    for (let i = 0; i < widthPanels.length; i++) {
        const p = widthPanels[i];
        if (isSidePanel(p, minW, maxW)) continue;
        candidates.push({ panel: p, role: 'стойка' });
    }

    const problems = [];
    for (let i = 0; i < candidates.length; i++) {
        const { panel, role } = candidates[i];
        const gap = gapToBack(panel, backPlane);
        if (gap > MAX_GAP_MM) {
            problems.push({
                panel,
                role,
                gap,
                name: panel.Name || '(без имени)',
            });
        }
    }

    return { problems, candidateCount: candidates.length, shelfCount: candidates.filter((c) => c.role === 'полка').length, uprightCount: candidates.filter((c) => c.role === 'стойка').length };
}

(function main() {
    const model = currentFileData && currentFileData.model;
    if (!model) {
        UI.dialogs.ErrorBox('Модель не открыта.');
        return;
    }

    let root = model;
    const selected = model.Selected || model.SelectedObj;
    if (selected && selected.List) root = selected;

    const panels = collectPanels(root);
    if (!panels.length) {
        UI.dialogs.ErrorBox('Панели не найдены.');
        return;
    }

    const backCandidates = panels.filter((p) => axisOfNormal(p) === DEPTH_AXIS);
    if (!backCandidates.length) {
        UI.dialogs.ErrorBox(
            `Не найдена панель с нормалью по оси глубины (${DEPTH_AXIS}).\n` +
                'Поменяй DEPTH_AXIS в начале скрипта.'
        );
        return;
    }

    backCandidates.sort((a, b) => {
        const ca = center(a)[DEPTH_AXIS];
        const cb = center(b)[DEPTH_AXIS];
        return BACK_INNER_IS_MIN ? cb - ca : ca - cb;
    });
    const back = backCandidates[0];
    const backPlane = backInnerCoord(back);

    const { problems, candidateCount, shelfCount, uprightCount } = findProblems(
        panels,
        back,
        backPlane
    );

    selectObjects(
        model,
        problems.map((p) => p.panel)
    );

    if (!problems.length) {
        UI.dialogs.MessageBox(
            `Проверка зазора до задней\r\n` +
                `Задняя: "${back.Name || '(без имени)'}"\r\n` +
                `Кандидатов: ${candidateCount} (полки ${shelfCount}, стойки ${uprightCount})\r\n` +
                `Проблем нет (допуск ${MAX_GAP_MM} мм).`
        );
        return;
    }

    problems.sort((a, b) => b.gap - a.gap);
    const lines = problems
        .slice(0, 40)
        .map(
            (p, idx) =>
                `${idx + 1}. [${p.role}] ${p.name} — ${p.gap.toFixed(1)} мм`
        )
        .join('\r\n');
    const more =
        problems.length > 40 ? `\r\n… и ещё ${problems.length - 40}` : '';

    UI.dialogs.MessageBox(
        `Не доходят до задней "${back.Name || ''}"\r\n` +
            `Проблемных: ${problems.length} (допуск ${MAX_GAP_MM} мм)\r\n` +
            `Проверено: полки ${shelfCount}, стойки ${uprightCount}\r\n\r\n` +
            `${lines}${more}\r\n\r\n` +
            `Эти панели выделены в модели.`
    );
})();
