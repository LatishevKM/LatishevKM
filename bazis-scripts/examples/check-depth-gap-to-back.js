/**
 * Базис-Мебельщик 2025 x64
 *
 * Проверка зазора внутренних до задней стенки.
 *
 * Исправления определения:
 *  - оси ширины/глубины считаются по модели (не захардкожены в Y)
 *  - задняя: имя + тонкий материал + край габарита; можно указать выделением
 *  - бока = крайние по центру среди панелей с нормалью ширины
 *  - стойки = остальные с нормалью ширины
 *  - направление «тыл» берётся от найденной задней
 *  - в конце — отчёт классификации (чтобы видеть, что именно определилось)
 */

const MAX_GAP_MM = 8;
const SIDE_CENTER_TOL_MM = 8;
const BACK_THIN_MM = 8;
const SKIP_NAME_RE = /ящик|box|drawer|фасад|двер|цоколь/i;
const BACK_NAME_RE = /зад/i;
const SHOW_DEBUG = true;

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
    let n;
    try {
        n = panel.NToGlobal(AxisZ);
    } catch (e) {
        return null;
    }
    const ax = Math.abs(n.x);
    const ay = Math.abs(n.y);
    const az = Math.abs(n.z);
    if (ax >= ay && ax >= az) return 'x';
    if (ay >= ax && ay >= az) return 'y';
    return 'z';
}

function gabOf(panel) {
    return { min: panel.GabMin, max: panel.GabMax };
}

function centerOf(panel) {
    const g = gabOf(panel);
    return {
        x: (g.min.x + g.max.x) / 2,
        y: (g.min.y + g.max.y) / 2,
        z: (g.min.z + g.max.z) / 2,
    };
}

function sizeOnAxis(panel, axis) {
    const g = gabOf(panel);
    return Math.abs(g.max[axis] - g.min[axis]);
}

function selectObjects(model, objects) {
    if (typeof model.UnPickAll === 'function') model.UnPickAll();
    else if (typeof model.UnSelectAll === 'function') model.UnSelectAll();
    for (let i = 0; i < objects.length; i++) objects[i].Selected = true;
}

function collectPanels(root) {
    const panels = [];
    walkObjectList(root, (obj) => {
        if (isPanel(obj)) panels.push(obj);
    });
    return panels;
}

function shouldSkip(panel) {
    return SKIP_NAME_RE.test(panel.Name || '');
}

/** Описать панель для классификации */
function describe(panel) {
    return {
        panel,
        name: panel.Name || '(без имени)',
        axis: axisOfNormal(panel),
        th: panel.Thickness,
        c: centerOf(panel),
        g: gabOf(panel),
    };
}

/**
 * Ширина = ось, по которой больше вертикальных панелей (бока+стойки).
 * Глубина = вторая горизонтальная ось.
 */
function detectAxes(descs) {
    let nx = 0;
    let ny = 0;
    for (let i = 0; i < descs.length; i++) {
        if (descs[i].axis === 'x') nx++;
        else if (descs[i].axis === 'y') ny++;
    }
    // при равенстве — ширина X, глубина Y (типичная постановка)
    const widthAxis = nx >= ny ? 'x' : 'y';
    const depthAxis = widthAxis === 'x' ? 'y' : 'x';
    return { widthAxis, depthAxis, nx, ny };
}

/**
 * Выбор задней:
 * 1) если выделена панель с нормалью глубины — она;
 * 2) иначе score: имя «зад» + тонкая + у края габарита по глубине.
 */
function pickBack(descs, depthAxis, selectedPanel) {
    const candidates = descs.filter((d) => d.axis === depthAxis);
    if (!candidates.length) return null;

    if (selectedPanel) {
        const sel = candidates.find((d) => d.panel === selectedPanel);
        if (sel) return sel;
    }

    let minC = Infinity;
    let maxC = -Infinity;
    for (let i = 0; i < candidates.length; i++) {
        const v = candidates[i].c[depthAxis];
        if (v < minC) minC = v;
        if (v > maxC) maxC = v;
    }
    const mid = (minC + maxC) / 2;

    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < candidates.length; i++) {
        const d = candidates[i];
        let score = 0;
        if (BACK_NAME_RE.test(d.name)) score += 100;
        if (d.th <= BACK_THIN_MM) score += 50;
        // ближе к краю габарита по глубине
        const distToEdge = Math.min(
            Math.abs(d.c[depthAxis] - minC),
            Math.abs(d.c[depthAxis] - maxC)
        );
        score += Math.max(0, 30 - distToEdge);
        // чуть предпочитаем «тыл» (больший край) — чаще так ставят модель
        if (d.c[depthAxis] >= mid) score += 5;
        if (score > bestScore) {
            bestScore = score;
            best = d;
        }
    }
    return best;
}

/**
 * Внутренняя пласть задней = та грань по глубине, что ближе к центру корпуса.
 */
function backInnerPlane(backDesc, depthAxis, moduleMidDepth) {
    const g = backDesc.g;
    const minD = g.min[depthAxis];
    const maxD = g.max[depthAxis];
    // какая грань ближе к середине модуля — та и «внутренняя»
    const innerIsMin =
        Math.abs(minD - moduleMidDepth) <= Math.abs(maxD - moduleMidDepth);
    return { plane: innerIsMin ? minD : maxD, innerIsMin };
}

function panelRearCoord(desc, depthAxis, innerIsMin) {
    // тыл начинки — край, ближайший к задней
    // если внутренняя пласть задней = min, тыл начинки = её max, и наоборот
    return innerIsMin ? desc.g.max[depthAxis] : desc.g.min[depthAxis];
}

function gapToBack(desc, depthAxis, backPlane, innerIsMin) {
    const rear = panelRearCoord(desc, depthAxis, innerIsMin);
    return innerIsMin ? backPlane - rear : rear - backPlane;
}

/**
 * Бока — вертикали по ширине с min/max центром.
 * Стойки — остальные вертикали по ширине.
 * Полки — горизонтали (нормаль Z), кроме skip.
 */
function classify(descs, backDesc, widthAxis) {
    const widthPanels = descs.filter(
        (d) =>
            d.panel !== backDesc.panel &&
            d.axis === widthAxis &&
            !shouldSkip(d.panel)
    );

    let minC = Infinity;
    let maxC = -Infinity;
    for (let i = 0; i < widthPanels.length; i++) {
        const v = widthPanels[i].c[widthAxis];
        if (v < minC) minC = v;
        if (v > maxC) maxC = v;
    }

    const sides = [];
    const uprights = [];
    for (let i = 0; i < widthPanels.length; i++) {
        const d = widthPanels[i];
        const c = d.c[widthAxis];
        const isSide =
            c <= minC + SIDE_CENTER_TOL_MM || c >= maxC - SIDE_CENTER_TOL_MM;
        if (isSide) sides.push(d);
        else uprights.push(d);
    }

    const shelves = descs.filter(
        (d) =>
            d.panel !== backDesc.panel &&
            d.axis === 'z' &&
            !shouldSkip(d.panel)
    );

    return { sides, uprights, shelves, widthPanels };
}

(function main() {
    const model = currentFileData && currentFileData.model;
    if (!model) {
        UI.dialogs.ErrorBox('Модель не открыта.');
        return;
    }

    let root = model;
    const selected = model.Selected || model.SelectedObj || null;
    if (selected && selected.List) root = selected;

    const panels = collectPanels(root);
    if (!panels.length) {
        UI.dialogs.ErrorBox('Панели не найдены.');
        return;
    }

    const descs = panels.map(describe).filter((d) => d.axis);
    const { widthAxis, depthAxis, nx, ny } = detectAxes(descs);

    const selectedPanel = selected && isPanel(selected) ? selected : null;
    const backDesc = pickBack(descs, depthAxis, selectedPanel);
    if (!backDesc) {
        UI.dialogs.ErrorBox(
            'Не удалось найти заднюю стенку.\n' +
                'Выдели заднюю панель и запусти скрипт снова.\n' +
                `Вертикалей по X: ${nx}, по Y: ${ny}`
        );
        return;
    }

    // середина модуля по глубине — по всем панелям
    let minD = Infinity;
    let maxD = -Infinity;
    for (let i = 0; i < descs.length; i++) {
        const g = descs[i].g;
        if (g.min[depthAxis] < minD) minD = g.min[depthAxis];
        if (g.max[depthAxis] > maxD) maxD = g.max[depthAxis];
    }
    const moduleMidDepth = (minD + maxD) / 2;
    const { plane: backPlane, innerIsMin } = backInnerPlane(
        backDesc,
        depthAxis,
        moduleMidDepth
    );

    const { sides, uprights, shelves } = classify(descs, backDesc, widthAxis);

    const candidates = uprights
        .map((d) => ({ desc: d, role: 'стойка' }))
        .concat(shelves.map((d) => ({ desc: d, role: 'полка' })));

    const problems = [];
    for (let i = 0; i < candidates.length; i++) {
        const { desc, role } = candidates[i];
        const gap = gapToBack(desc, depthAxis, backPlane, innerIsMin);
        if (gap > MAX_GAP_MM) {
            problems.push({
                panel: desc.panel,
                name: desc.name,
                role,
                gap,
            });
        }
    }

    selectObjects(
        model,
        problems.length ? problems.map((p) => p.panel) : [backDesc.panel]
    );

    const debugLines = SHOW_DEBUG
        ? [
              `Оси: ширина=${widthAxis} (N=${nx}), глубина=${depthAxis} (N=${ny})`,
              `Задняя: "${backDesc.name}" t=${backDesc.th} innerIsMin=${innerIsMin}`,
              `Бока (${sides.length}): ${sides
                  .map((d) => d.name)
                  .join(', ') || '—'}`,
              `Стойки (${uprights.length}): ${uprights
                  .map((d) => d.name)
                  .join(', ') || '—'}`,
              `Полки (${shelves.length}): ${shelves
                  .map((d) => d.name)
                  .join(', ') || '—'}`,
              '',
          ].join('\r\n')
        : '';

    if (!problems.length) {
        UI.dialogs.MessageBox(
            debugLines +
                `Проблем нет (допуск ${MAX_GAP_MM} мм).\r\n` +
                `Задняя выделена для проверки.`
        );
        return;
    }

    problems.sort((a, b) => b.gap - a.gap);
    const lines = problems
        .slice(0, 35)
        .map(
            (p, idx) =>
                `${idx + 1}. [${p.role}] ${p.name} — ${p.gap.toFixed(1)} мм`
        )
        .join('\r\n');
    const more =
        problems.length > 35 ? `\r\n… и ещё ${problems.length - 35}` : '';

    UI.dialogs.MessageBox(
        debugLines +
            `Не доходят: ${problems.length}\r\n\r\n` +
            `${lines}${more}`
    );
})();
