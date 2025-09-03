import streamlit as st
import pandas as pd
import io

# Настройка страницы
st.set_page_config(page_title="Грин: Обработка данных", layout="centered")
st.title("📊 Обработка файла Грин.xls")
st.markdown("Загрузите файл — получите сводную таблицу по категориям и СКЮ КОДАМ.")

def process_greens_file(uploaded_file):
    # Читаем файл без заголовков
    df = pd.read_excel(uploaded_file, header=None)

    # Ищем строку с "Сеть" в первом столбце
    header_row_idx = df[df[0] == "Сеть"].index
    if len(header_row_idx) == 0:
        raise ValueError("Не найдена строка с 'Сеть' в первом столбце.")
    header_row_idx = header_row_idx[0]

    # Устанавливаем заголовки
    df.columns = df.iloc[header_row_idx]
    df = df[header_row_idx + 1:].reset_index(drop=True)

    # Переименуем для удобства (на случай, если есть пробелы)
    df.columns = [str(col).strip() for col in df.columns]

    # Проверим нужные столбцы
    required_cols = ["Адрес торгового объекта", "Описание номенклатуры", "Штрих_код", "Остаток"]
    for col in required_cols:
        if col not in df.columns:
            raise ValueError(f"Не найден столбец: {col}")

    # === Функция для СКЮ КОД ===
    def get_sku(barcode):
        try:
            barcode_str = str(int(barcode))  # Убираем .0
            if len(barcode_str) >= 5:
                last_5 = barcode_str[-5:]
                return last_5[:4].zfill(4)  # 4 цифры с ведущими нулями
            else:
                return "0000"
        except:
            return "0000"

    # === Функция для Категории ===
    def get_category(name):
        if pd.isna(name) or not isinstance(name, str):
            return "Прочие"
        name = str(name)
        if "ГринФилд" in name:
            return "Greenfield"
        elif "Тесс" in name:
            return "Tess"
        elif "Жокей" in name:
            return "Жокей раствор" if "раств." in name else "Жокей Натуральный"
        elif "Жардин" in name:
            return "JARDIN раствор" if "раств." in name else "JARDIN натур"
        elif any(x in name for x in ["Нури", "Ява", "Канди", "Гита"]):
            return "Принцессы"
        else:
            return "Прочие"

    # Применяем
    df["Категория"] = df["Описание номенклатуры"].apply(get_category)
    df["СКЮ КОД"] = df["Штрих_код"].apply(get_sku)

    # Приводим "Остаток" к числу
    df["Остаток"] = pd.to_numeric(df["Остаток"], errors="coerce").fillna(0)

    # Фильтр: только где Остаток > 0
    df_filtered = df[df["Остаток"] > 0].copy()

    if df_filtered.empty:
        return None  # Нет данных с остатком > 0

    # Группировка: Адрес + Категория → список СКЮ КОДОВ
    pivot = df_filtered.groupby(
        ["Адрес торгового объекта", "Категория"], as_index=False
    )["СКЮ КОД"].apply(lambda x: ", ".join(x)).rename(columns={"СКЮ КОД": "СКЮ КОДЫ"})

    return pivot

# === Интерфейс ===
uploaded_file = st.file_uploader("Загрузите файл Грин.xls", type=["xls", "xlsx"])

if uploaded_file is not None:
    with st.spinner("Обработка файла..."):
        try:
            result_df = process_greens_file(uploaded_file)
            if result_df is None or len(result_df) == 0:
                st.warning("❌ В файле нет позиций с остатком больше 0.")
            else:
                st.success("✅ Обработка завершена!")
                st.dataframe(result_df, use_container_width=True)

                # Подготовка файла для скачивания
                output = io.BytesIO()
                with pd.ExcelWriter(output, engine="openpyxl") as writer:
                    result_df.to_excel(writer, index=False, sheet_name="СводнаяТаблица")
                output.seek(0)

                st.download_button(
                    label="📥 Скачать результат (Excel)",
                    data=output,
                    file_name="СводнаяТаблица_Грин.xlsx",
                    mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                )
        except Exception as e:
            st.error(f"❌ Ошибка при обработке файла: {str(e)}")
else:
    st.info("Пожалуйста, загрузите файл.")

# Информация
st.markdown("---")
st.caption("Приложение обрабатывает файл по правилам: категории, СКЮ КОД из 5→4 цифр, фильтр по остатку > 0.")