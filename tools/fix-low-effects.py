"""把新增题里低于 07 建议下限（±0.3）的非零 effect 抬到合法幅度。

校验规则：effects 非零但绝对值 < 0.3 会告警（07 建议下限）。
新题的区分度本来就该落在 0.3–0.8，这里把被漏掉的几个抬回来，方向保持不变。
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "questions.json")
FLOOR = 0.3


def main():
    data = json.load(open(DATA, encoding="utf-8"))
    fixed = 0
    for q in data["questions"]:
        for o in q["options"]:
            eff = o.get("effects", {})
            for d, v in list(eff.items()):
                if v != 0 and abs(v) < FLOOR:
                    eff[d] = FLOOR if v > 0 else -FLOOR
                    fixed += 1

    with open(DATA, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"抬起 {fixed} 个低于下限的 effect")


if __name__ == "__main__":
    main()
