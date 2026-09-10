# 像素素材说明

本目录资源由仓库脚本 `pnpm gen:assets`（`scripts/gen-pixel-assets.mjs`）**程序化生成**，用于像素办公室大屏原型。

| 文件 | 说明 |
|---|---|
| `tileset.png` | 16×16 办公室瓦片（地板、墙、桌、电脑、植物、地毯、椅子） |
| `characters.png` | 4 套皮肤 × 四向 × 3 帧行走图 |
| `office.json` | Tiled 兼容的正交地图（ground / furniture / collision / objects） |

风格参考了常见 CC0 像素办公室/角色包的视觉习惯（如 Kenney 的 Indoor / 角色雪碧图布局），但**贴图像素为原创生成，未嵌入第三方二进制素材**。

许可：与本仓库一致，可自由用于本项目演示与二次修改。

如需替换为 Kenney 等 CC0 原包，保留同名文件与 `office.json` 的 tileset 引用即可。
