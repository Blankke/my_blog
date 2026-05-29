---
title: Matmul Fusion
publish: false
cover: false
aside: false
---
推荐阅读：
[Towards High-Goodput LLM Serving with Prefill-decode Multiplexing](https://export.arxiv.org/pdf/2504.14489v3)
ELORA: Efficient LoRA and KV Cache Management for Multi-LoRA LLM Serving
读论文：
- **精读 Automatic Horizontal Fusion**，把你的工作放进 related work：你不是第一个想到 horizontal fusion 的人，但你可以说明你的场景是 LoRA/multi-GEMM/Triton/LLM inference 下的特殊实例。
- **读 LoRA + Punica + S-LoRA**，因为这直接决定你这个 `X@C + X@A@B` 到底是不是已有系统已经处理过。
- **读 FlashAttention-1/2**，但目标不是“学完 LLM”，而是学它如何把一个数学表达重排成 IO-aware kernel。


# Matmul Fusion
这是在完成一套关于 Matmul Fusion 的笔记后，整理成的一个专题页。Matmul Fusion 的原始题目在这里：https://zhao-han.notion.site/1-Triton-34ccfdeeea6f803fa973fff139631390

这个专题页把这一组笔记放在一起，后续继续往这个文件夹里加文章时，也可以继续从这里进入。
