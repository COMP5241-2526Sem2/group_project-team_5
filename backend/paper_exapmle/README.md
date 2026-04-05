# PDF 录入清单

下面这些文件已按文件名先做了初步分类，方便后续批量录入数据库。

## 1. 试卷

- [SPCC_Form Six Mock Examination 2019 -Paper 1B QP - 6C (10) Chan Yuen Kiu.pdf](SPCC_Form%20Six%20Mock%20Examination%202019%20-Paper%201B%20QP%20-%206C%20(10)%20Chan%20Yuen%20Kiu.pdf)
- [WFN_19-20 Economics Paper 2.pdf](WFN_19-20%20Economics%20Paper%202.pdf)
- [WYHK1920-Bio_PAPER2 - _3.pdf](WYHK1920-Bio_PAPER2%20-%20_3.pdf)
- [ssgc_2016-2017_P2 - Kelvin Yu.pdf](ssgc_2016-2017_P2%20-%20Kelvin%20Yu.pdf)
- [2024-2025 S3 bio 2nd Mid term.pdf](2024-2025%20S3%20bio%202nd%20Mid%20term.pdf)

## 2. 教材

- [Textbook Ch. 5 PDF.pdf](Textbook%20Ch.%205%20PDF.pdf)

## 3. 练习 / 补充讲义

- [Physics Ch1 Supplementary notes and exercise.pdf](Physics%20Ch1%20Supplementary%20notes%20and%20exercise.pdf)

## 4. 录入建议

这些 PDF 目前还没有做正文抽取，所以这里只能先依据文件名判断类型。

- 试卷类文件后续建议录入到 `papers`、`paper_sections`、`paper_questions`、`paper_question_options`
- 教材类文件后续建议录入到 `textbooks`
- 练习 / 补充讲义类文件后续建议优先拆成题库，录入到 `question_bank_items` 和 `question_bank_options`

## 5. 下一步

如果你要继续，我可以接着做两件事：

1. 给这些 PDF 逐个建立结构化入库模板
2. 直接帮你生成一份批量导入脚本骨架，等你补文本后就能写库