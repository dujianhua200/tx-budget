#!/usr/bin/env python3
"""生成 tests/fixtures/reference-book.json（参考结算书样本夹具，v2 增量 3）。

来源：docs/print-layout-spec.raw.json（参考 .xls 经 LibreOffice 转换后的逐表提取）。
- 表三甲/乙/丙/四甲的数据行直接从 raw.json 提取（数值字符串转数字，空转 None/0）。
- 表二折前/折后、表一、汇总表、表五为参考实测值（已逐项核对，见脚本内注释）。
  注意：夹具取参考实测值（含 Q2/Q5 的参考处理：折后 11 项为 0、折后规费子项为打折后值、
  折后销项税额为 0），仅用于版式 + 映射验收；引擎语义由合成工程测试覆盖。
用法：python3 scripts/build_reference_fixture.py
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_PATH = os.path.join(ROOT, "docs", "print-layout-spec.raw.json")
OUT_PATH = os.path.join(ROOT, "tests", "fixtures", "reference-book.json")


def num(v):
    """数值字符串转 float；空/None → None。"""
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v).replace(",", ""))
    except ValueError:
        return None


def cells_of(sheet):
    cells = {}
    for c in sheet["cells"]:
        cells[c["coord"]] = c.get("value")
    return cells


def main():
    with open(RAW_PATH, encoding="utf-8") as f:
        raw = json.load(f)

    # ---- 表三甲：raw 第 1 页行 6–28、第 2 页行 35–51（合计行除外）----
    sh = raw["工程量表(表三)甲"]
    c = cells_of(sh)
    t3a = []
    for r in list(range(6, 29)) + list(range(35, 52)):
        code = c.get(f"B{r}")
        if code is None:
            continue
        t3a.append({
            "code": str(code),
            "name": c.get(f"C{r}") or "",
            "unit": c.get(f"E{r}") or "",
            "qty": num(c.get(f"F{r}")),
            "techUnit": num(c.get(f"G{r}")),
            "laborUnit": num(c.get(f"H{r}")),
            "tech": num(c.get(f"I{r}")),
            "labor": num(c.get(f"J{r}")),
        })
    tech_sub = round(sum((x["tech"] or 0) for x in t3a), 3)
    labor_sub = round(sum((x["labor"] or 0) for x in t3a), 3)
    print(f"表三甲行数={len(t3a)} 技工小计和={tech_sub} 普工小计和={labor_sub}")
    assert len(t3a) == 40, f"表三甲应为 40 行数据，实得 {len(t3a)}"
    assert abs(tech_sub - 1269.189) <= 0.011, "技工小计与参考合计 1269.189 不符"
    assert abs(labor_sub - 790.666) <= 0.011, "普工小计与参考合计 790.666 不符"

    # ---- 表三乙：行 6–10；表三丙：行 6–13 ----
    def equip_rows(sheet_name, row_range):
        sh = raw[sheet_name]
        c = cells_of(sh)
        rows = []
        for r in row_range:
            rows.append({
                "quota": str(c.get(f"B{r}")),
                "quotaName": c.get(f"C{r}") or "",
                "unit": c.get(f"D{r}") or "",
                "qty": num(c.get(f"E{r}")),
                "equipName": (c.get(f"F{r}") or "").strip(),
                "equipUnit": "台班",
                "consumption": num(c.get(f"G{r}")),
                "price": num(c.get(f"H{r}")),
                "sessions": num(c.get(f"I{r}")),
                "amount": num(c.get(f"J{r}")),
            })
        return rows

    t3b_rows = equip_rows("机械台班表(表三)乙", range(6, 11))
    t3c_rows = equip_rows("仪器仪表使用表(表三)丙", range(6, 14))
    t3b_total = round(sum(x["amount"] or 0 for x in t3b_rows), 2)
    t3c_total = round(sum(x["amount"] or 0 for x in t3c_rows), 2)
    print(f"表三乙行数={len(t3b_rows)} 小计={t3b_total}；表三丙行数={len(t3c_rows)} 合计={t3c_total}")
    assert abs(t3b_total - 5580.00) <= 0.011
    assert abs(t3c_total - 15455.26) <= 0.011

    # ---- 表四甲：行 8–23（甲供）；备注 J 列 ----
    sh = raw["主要材料表(表四)甲"]
    c = cells_of(sh)
    t4a_rows = []
    for r in range(8, 24):
        name = c.get(f"B{r}") or ""
        spec = c.get(f"C{r}") or ""
        t4a_rows.append({
            "key": f"{name}|{spec}",
            "name": name, "spec": spec,
            "unit": c.get(f"D{r}") or "",
            "qty": num(c.get(f"E{r}")),
            "priceExcl": num(c.get(f"F{r}")),
            "priceVat": 0, "priceIncl": num(c.get(f"F{r}")),
            "amtExcl": num(c.get(f"G{r}")),
            "amtVat": num(c.get(f"H{r}")) or 0,
            "amtIncl": num(c.get(f"I{r}")),
            "unmatched": False,
            "remark": c.get(f"J{r}") or "",
        })
    t4a_total = round(sum(x["amtExcl"] or 0 for x in t4a_rows), 2)
    print(f"表四甲行数={len(t4a_rows)} 甲供小计={t4a_total}")
    assert abs(t4a_total - 74246.30) <= 0.011

    # ---- 表二折前 / 折后（参考实测值，见 print-layout-spec.md §5.2 与设计文档 §12.3）----
    t2_before = {
        "laborTotal": 192918.18, "techFee": 144687.55, "laborFee": 48230.63,
        "jiaMat": 74246.30, "yiMat": 0, "mainMat": 74246.30, "auxMat": 222.74,
        "matTotal": 74469.04, "machineFee": 5580.00, "instrumentFee": 15455.26,
        "directFee": 288422.48, "envFee": 0, "civilFee": 2893.77, "carryFee": 6559.22,
        "disturbFee": 11575.09, "handoverFee": 6366.30, "tempFee": 9645.91,
        "vehicleFee": 9645.91, "nightFee": 4822.95, "winterFee": 3472.53,
        "toolFee": 2893.77, "utilityFee": 0, "specialFee": 0, "protectFee": 3858.36,
        "earthFee": 0, "dispatchFee": 5916.00, "bigMachineFee": 0,
        "measureFee": 67649.81, "directTotal": 356072.29, "sewageFee": 0,
        "socialFee": 54981.68, "housingFee": 8083.27, "accidentFee": 1929.18,
        "regFee": 64994.13, "mgmtFee": 52859.58, "indirectTotal": 117853.71,
        "profit": 38583.64, "exclTax": 512509.64, "outputTax": 39443.70,
        "inclTax": 551953.34, "dispatchUnit": 174, "dispatchPeople": 17,
    }
    # 折后取参考实测值：Q2 的 11 项为 0；规费子项为打折后值，合计为还原值；销项税额为空/0。
    t2_after = {
        "laborTotal": 73115.99, "techFee": 54836.58, "laborFee": 18279.41,
        "jiaMat": 74246.30, "yiMat": 0, "mainMat": 74246.30, "auxMat": 222.74,
        "matTotal": 74469.04, "machineFee": 2114.82, "instrumentFee": 5857.54,
        "directFee": 155557.39, "envFee": 0, "civilFee": 2893.77, "carryFee": 0,
        "disturbFee": 0, "handoverFee": 2412.83, "tempFee": 0,
        "vehicleFee": 3655.80, "nightFee": 0, "winterFee": 0,
        "toolFee": 1096.74, "utilityFee": 0, "specialFee": 0, "protectFee": 0,
        "earthFee": 0, "dispatchFee": 0, "bigMachineFee": 0,
        "measureFee": 10059.14, "directTotal": 165616.53, "sewageFee": 0,
        "socialFee": 20838.06, "housingFee": 3063.56, "accidentFee": 731.16,
        "regFee": 64994.14, "mgmtFee": 20033.78, "indirectTotal": 85027.92,
        "profit": 14623.20, "exclTax": 265267.65, "outputTax": 0,
        "inclTax": 265267.65, "dispatchUnit": 174, "dispatchPeople": 17,
    }

    # ---- 表五：仅安全生产费有值（参考实测）；其余行 basis/rate 取 DEFAULT_TABLE5_FEES ----
    t5_defs = [
        ("landFee", "建设用地及综合赔补费", "manual", 0, 0, 1),
        ("mgmt2", "项目建设管理费", "preDiscountExclTax", 0.02, 0.06, 2),
        ("feasibilityFee", "可行性研究费", "manual", 0, 0, 3),
        ("researchFee", "研究试验费", "manual", 0, 0, 4),
        ("designTotal", "勘察设计费", "sum", None, 0.06, 5),
        ("surveyFee", "其中：勘察费", "surveyKm", None, 0.06, 5.1),
        ("designFee", "其中：设计费", "preDiscountExclTax", 0.0495, 0.06, 5.2),
        ("envEvalFee", "环境影响评价费", "manual", 0, 0, 6),
        ("supervisionFee", "建设工程监理费", "manual", 0, 0, 7),
        ("safetyFee", "安全生产费", "preDiscountExclTax", 0.02, 0, 8),
        ("importTechFee", "引进技术及进口设备其他费", "manual", 0, 0, 9),
        ("insuranceFee", "工程保险费", "manual", 0, 0, 10),
        ("tenderFee", "工程招标代理费", "manual", 0, 0, 11),
        ("patentFee", "专利及专利技术使用费", "manual", 0, 0, 12),
        ("otherFee", "其他费用", "manual", 0, 0, 13),
        ("productionPrepFee", "生产准备及开办费(运营费)", "manual", 0, 0, 14),
    ]
    t5_rows = []
    for key, name, basis, rate, vat_rate, order in t5_defs:
        excl = 10250.19 if key == "safetyFee" else 0
        t5_rows.append({
            "key": key, "name": name, "basis": basis, "rate": rate,
            "vatRate": vat_rate, "order": order, "note": "",
            "enabled": True, "excl": excl, "vat": 0, "incl": excl, "amount": excl,
        })

    fixture = {
        "_note": "参考结算书样本夹具（2024 联通河南信阳宽带接入扩容工程 31）。表二折后等值取参考实测值（含 Q2/Q5 参考处理），仅用于版式+映射验收；引擎语义由合成工程测试覆盖。",
        "project": {
            "name": "2024年中国联通河南信阳宽带接入扩容工程（31）",
            "info": {
                "建设单位": "中国联合网络通信有限公司信阳市分公司",
                "建设项目名称": "2024年中国联通河南信阳宽带接入扩容工程（31）",
                "单项工程名称": "通信线路工程",
                "工程类型": "通信线路工程",
                "表格编号": "通信线路-",
                "项目编号": "9MA24CE0000019",
                "编制": "adu", "审核": "", "编制日期": "2026-05-13",
                "施工距离": "35KM以上", "施工实际里程": 0, "冬雨季施工费": "Ⅲ类地区",
                "施工折扣": 0.379, "甲供增值税": 0.13, "乙供增值税": 0.09,
                "设计单位": "中电科普天科技股份有限公司",
                "施工单位": "中国通信建设第一工程局有限公司",
                "监理单位": "河南省通信建设管理咨询有限公司",
                "编制单位": "", "参审人员": "", "工程负责人": "",
            },
            "quantities": [],
        },
        "result": {
            "info": {
                "建设单位": "中国联合网络通信有限公司信阳市分公司",
                "建设项目名称": "2024年中国联通河南信阳宽带接入扩容工程（31）",
                "单项工程名称": "通信线路工程",
                "工程类型": "通信线路工程",
                "表格编号": "通信线路-",
                "项目编号": "9MA24CE0000019",
                "编制": "adu", "审核": "", "编制日期": "2026-05-13",
                "施工距离": "35KM以上", "施工实际里程": 0, "冬雨季施工费": "Ⅲ类地区",
                "施工折扣": 0.379, "甲供增值税": 0.13, "乙供增值税": 0.09,
                "设计单位": "中电科普天科技股份有限公司",
                "施工单位": "中国通信建设第一工程局有限公司",
                "监理单位": "河南省通信建设管理咨询有限公司",
                "编制单位": "", "参审人员": "", "工程负责人": "",
            },
            "rate": {
                "techPrice": 114, "laborPrice": 61, "auxRate": 0.003, "envRate": 0,
                "civilRate": 0.015, "carryRate": 0.034, "disturbRate": 0.06,
                "handoverRate": 0.033, "tempNearRate": 0.026, "tempFarRate": 0.05,
                "vehicleRate": 0.05, "nightRate": 0.025, "winterRate": 0.018,
                "toolRate": 0.015, "utilityRate": 0, "protectRate": 0.02,
                "socialRate": 0.285, "housingRate": 0.0419, "accidentRate": 0.01,
                "mgmtRate": 0.274, "profitRate": 0.2,
                "jiaTax": 0.13, "yiTax": 0.09, "outputTax": 0.09, "taxRate": 0.09,
            },
            "discount": 0.379,
            "discountRule": {
                "discountRate": 0.379,
                "noDiscountKeys": ["mainMat", "auxMat", "civilFee", "regFee",
                                   "socialFee", "housingFee", "accidentFee",
                                   "sewageFee", "safetyFee"],
            },
            "techSub": tech_sub, "laborSub": labor_sub, "adjRate": 0,
            "techDays": 1269.189, "laborDays": 790.666,
            "table3A": t3a,
            "table3B": {"rows": t3b_rows, "total": 5580.00},
            "table3C": {"rows": t3c_rows, "total": 15455.26},
            "table4A": {"rows": t4a_rows, "totalExcl": 74246.30, "totalVat": 0, "totalIncl": 74246.30},
            "table4B": {"rows": [], "totalExcl": 0, "totalVat": 0, "totalIncl": 0},
            "table4Equip": {"rows": [], "totalExcl": 0, "totalVat": 0, "totalIncl": 0},
            "table2Before": t2_before,
            "table2After": t2_after,
            "table2": t2_after,
            "table5": {
                "rows": t5_rows,
                "totalExcl": 10250.19, "totalVat": 0, "totalIncl": 10250.19,
                "mgmt2": 0, "mgmt2Vat": 0, "mgmt2Incl": 0,
                "surveyFee": 0, "surveyVat": 0, "designFee": 0, "designVat": 0,
                "designTotal": 0, "designTotalVat": 0,
                "safetyFee": 10250.19, "safetyVat": 0, "safetyIncl": 10250.19,
                "productionPrepFee": 0, "productionPrepVat": 0, "productionPrepIncl": 0,
            },
            "table1": {
                "beforeDiscount": 512509.64, "afterDiscount": 265267.65,
                "taxBefore": 39443.70, "taxAfter": 0,
                "totalBefore": 551953.34, "totalAfter": 265267.65,
                "otherFee": 10250.19, "otherVat": 0, "otherIncl": 10250.19,
                "sumExcl": 275517.84, "sumVat": 0, "sumIncl": 275517.84,
                "equipFee": 0, "equipVat": 0, "equipIncl": 0,
                "grandExcl": 275517.84, "grandVat": 0, "grandIncl": 275517.84,
            },
            "summary": {
                "constructionExcl": 265267.65, "constructionVat": 0, "constructionIncl": 265267.65,
                "other": 10250.19, "otherVat": 0, "otherIncl": 10250.19,
                "totalExcl": 275517.84, "totalVat": 0, "totalIncl": 275517.84,
            },
            "warnings": [],
            "surveyKm": 0, "surveyRaw": 0,
        },
    }
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(fixture, f, ensure_ascii=False, indent=1)
    print(f"已生成 {OUT_PATH}")


if __name__ == "__main__":
    sys.exit(main())
