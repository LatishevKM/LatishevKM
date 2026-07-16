"""
WingLine L — подбор комплекта и проверка задачи монтажа.
Система: Hettich WingLine L (складные фасады, верхний ход).
"""

from __future__ import annotations

import streamlit as st

# Лимиты по каталогу Hettich WingLine L (ориентир для комплектации)
LIMITS = {
    "light_no_bottom": {
        "label": "WingLine L Light — без нижней направляющей",
        "max_height": 2400,
        "typical_height_kit": 1700,
        "max_weight": 12,
        "width_min": 250,
        "width_max": 600,
        "bottom_guide": False,
        "note": (
            "Комплекты «без нижнего ролика» в продаже чаще размечены как H500–1700 "
            "или до 2400 мм при весе створки ≤ 12 кг. Профиль заказывается отдельно."
        ),
    },
    "heavy_with_bottom": {
        "label": "WingLine L Heavy — с нижней направляющей",
        "max_height": 2600,
        "typical_height_kit": 2600,
        "max_weight": 25,
        "width_min": 250,
        "width_max": 600,
        "bottom_guide": True,
        "note": (
            "Для створок H2400–2600 обязателен комплект Heavy с нижним роликом "
            "и нижней направляющей. Толщина фасада 16–25 мм."
        ),
    },
}

HINGE_COUNT = [
    (1000, 2),
    (1700, 2),
    (2200, 3),
    (2600, 3),
]


def hinge_sets_for_height(height_mm: int) -> int:
    """Число средних петель на одну складную дверь (2 створки)."""
    count = 2
    for max_h, n in HINGE_COUNT:
        if height_mm <= max_h:
            return n
        count = n
    return count


def estimate_leaf_weight_kg(height_mm: int, width_mm: int, thickness_mm: float, density: float) -> float:
    """Оценка веса одной створки, кг."""
    area_m2 = (height_mm / 1000) * (width_mm / 1000)
    return round(area_m2 * (thickness_mm / 1000) * density, 2)


def recommend(
    height_mm: int,
    width_mm: int,
    leaves: int,
    no_bottom: bool,
    weight_kg: float,
) -> dict:
    issues: list[str] = []
    ok_width = LIMITS["heavy_with_bottom"]["width_min"] <= width_mm <= LIMITS["heavy_with_bottom"]["width_max"]
    if not ok_width:
        issues.append(
            f"Ширина створки {width_mm} мм вне диапазона 250–600 мм."
        )

    if leaves not in (2, 4):
        issues.append("Типичная схема WingLine L: 2 створки (одна складная дверь) или 2+2.")

    # Главная коллизия задачи
    if no_bottom and height_mm > LIMITS["light_no_bottom"]["max_height"]:
        issues.append(
            f"Высота {height_mm} мм несовместима с вариантом без нижней направляющей "
            f"(макс. {LIMITS['light_no_bottom']['max_height']} мм при ≤12 кг)."
        )

    if no_bottom and weight_kg > LIMITS["light_no_bottom"]["max_weight"]:
        issues.append(
            f"Оценка веса створки {weight_kg} кг > 12 кг — без нижней направляющей нельзя."
        )

    if height_mm > 2400 or weight_kg > 12:
        kit_key = "heavy_with_bottom"
    elif no_bottom:
        kit_key = "light_no_bottom"
    else:
        kit_key = "heavy_with_bottom" if height_mm > 1700 else "light_no_bottom"

    kit = LIMITS[kit_key]

    if height_mm > kit["max_height"]:
        issues.append(f"Высота превышает лимит выбранного класса ({kit['max_height']} мм).")
    if weight_kg > kit["max_weight"]:
        issues.append(f"Вес створки превышает лимит ({kit['max_weight']} кг).")

    # Практическая рекомендация под задачу
    if no_bottom and height_mm >= 2600:
        verdict = "conflict"
        recommendation = (
            "По каталогу Hettich для H=2600 мм нужен WingLine L Heavy **с нижней направляющей**. "
            "Вариант «без нижней» на эту высоту не сертифицирован. "
            "Варианты: (1) поставить нижнюю направляющую / ролик; "
            "(2) уменьшить высоту створки ≤2400 мм и уложиться в ≤12 кг; "
            "(3) согласовать скрытый монтаж нижней направляющей сверху внутрь модуля "
            "(при этом сторону комплекта левый/правый меняют местами)."
        )
    elif kit_key == "heavy_with_bottom":
        verdict = "ok_heavy"
        recommendation = (
            "Берите комплект WingLine L Heavy на H2400–2600, с нижним роликом. "
            "Для двух складных створок (одна дверь) — один комплект фурнитуры + профиль. "
            "Для двух независимых дверей (4 створки) — два комплекта."
        )
    else:
        verdict = "ok_light"
        recommendation = (
            "Допустим комплект Light без нижнего ролика при весе створки ≤12 кг. "
            "Проверьте фактический вес готового фасада с кромкой и фурнитурой."
        )

    track_length = width_mm * (2 if leaves == 2 else 4)
    # Профиль обычно 1200 или 2400; для одной двери из 2 створок по 390 — проём ~780 + зазоры
    opening_width = width_mm * 2 if leaves == 2 else width_mm * 4

    return {
        "verdict": verdict,
        "kit": kit,
        "kit_key": kit_key,
        "issues": issues,
        "recommendation": recommendation,
        "hinges": hinge_sets_for_height(height_mm),
        "opening_width_approx": opening_width,
        "track_hint": "1200 мм" if opening_width <= 1100 else "2400 мм (подрезать по проёму)",
    }


def main() -> None:
    st.set_page_config(page_title="WingLine L — монтаж", layout="centered")
    st.title("WingLine L: складные фасады")
    st.caption("Проверка задачи и подбор класса комплекта Hettich WingLine L")

    with st.sidebar:
        st.header("Параметры задачи")
        height = st.number_input("Высота створки, мм", min_value=500, max_value=3000, value=2600, step=10)
        width = st.number_input("Ширина створки, мм", min_value=200, max_value=800, value=390, step=5)
        leaves = st.selectbox(
            "Количество створок",
            options=[2, 4],
            index=0,
            help="2 = одна складная дверь из двух фасадов; 4 = две двери",
        )
        no_bottom = st.checkbox("Без нижней направляющей", value=True)
        thickness = st.number_input("Толщина фасада, мм", min_value=12.0, max_value=25.0, value=16.0, step=1.0)
        density = st.number_input(
            "Плотность плиты, кг/м³",
            min_value=500.0,
            max_value=900.0,
            value=700.0,
            step=10.0,
            help="МДФ ≈ 700–800, ЛДСП ≈ 650–700",
        )
        side = st.selectbox("Сторона открывания", ["левая", "правая", "уточнить на месте"])

    weight = estimate_leaf_weight_kg(int(height), int(width), float(thickness), float(density))
    result = recommend(int(height), int(width), int(leaves), no_bottom, weight)

    st.subheader("Карточка задачи")
    c1, c2, c3 = st.columns(3)
    c1.metric("Створки", f"{leaves} шт")
    c2.metric("Размер", f"{int(height)} × {int(width)} мм")
    c3.metric("Вес створки (оценка)", f"{weight} кг")

    st.write(
        f"**Нижняя направляющая:** {'нет (запрос)' if no_bottom else 'да'} · "
        f"**Открывание:** {side} · "
        f"**Средних петель:** {result['hinges']} на дверь · "
        f"**Профиль:** {result['track_hint']}"
    )

    if result["verdict"] == "conflict":
        st.error("Конфликт с лимитами производителя")
    elif result["issues"]:
        st.warning("Есть замечания по параметрам")
    else:
        st.success("Параметры в допустимом диапазоне для рекомендованного комплекта")

    st.info(result["recommendation"])

    if result["issues"]:
        st.markdown("**Замечания:**")
        for issue in result["issues"]:
            st.markdown(f"- {issue}")

    st.subheader("Рекомендуемый класс")
    kit = result["kit"]
    st.markdown(
        f"""
| Параметр | Значение |
|---|---|
| Комплект | {kit['label']} |
| Макс. высота | {kit['max_height']} мм |
| Макс. вес створки | {kit['max_weight']} кг |
| Ширина створки | {kit['width_min']}–{kit['width_max']} мм |
| Нижняя направляющая | {'нужна' if kit['bottom_guide'] else 'не нужна'} |
"""
    )
    st.caption(kit["note"])

    st.subheader("Чек-лист монтажа")
    steps = [
        "Проверить проём и диагонали корпуса, зафиксировать шкаф от опрокидывания.",
        "Разметить и установить верхний ходовой профиль (подрезать по ширине проёма).",
        "Если Heavy — установить нижнюю направляющую (или верхний монтаж направляющей внутрь модуля).",
        "Присадить чашки петель Sensys 110° на боковую створку (крепление к боковине).",
        f"Установить {result['hinges']} средних петли между створками (шаблоны из комплекта).",
        "Смонтировать верхний ходовой элемент и (для Heavy) нижний ролик.",
        "Навесить створки, отрегулировать: высота ±3 мм, глубина ±2 мм, ширина ±2 мм.",
        "При необходимости — Push to Move / Pull to Move Silent и фиксатор.",
        "Прогнать циклы открывания, проверить зазоры и ход без заеданий.",
    ]
    for i, step in enumerate(steps, 1):
        st.checkbox(step, key=f"step_{i}")

    st.markdown("---")
    st.caption(
        "Ориентир по публичным лимитам Hettich WingLine L. "
        "Перед заказом сверяйте артикулы и инструкцию конкретного комплекта."
    )


if __name__ == "__main__":
    main()
