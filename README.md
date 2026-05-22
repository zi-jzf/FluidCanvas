# Fluid Canvas

選んだ一枚を流体へと変え、直感的にかき混ぜるインタラクティブ・キャンバス

![GIF1](https://github.com/user-attachments/assets/4e7e1d90-1c71-4ed2-baa7-1b93f417d5cc)
![GIF2](https://github.com/user-attachments/assets/2e923827-d6cb-4b19-aebb-d01cf2df89c4)

[▶ 詳細な映像をVimeoで見る](https://vimeo.com/1193861935)

## 概要

ゴッホの「星月夜」に見られる渦のような動きから着想を得て、静止した画像に流体シミュレーションの動きを持たせるインタラクティブアートです。

iPadでアップロードした写真の被写体をAIが即座に切り抜き、被写体を固定し背景を流体としてかき混ぜます。Apple Pencilの筆圧でPC画面上の流体を操作することで、静止していた一枚の写真が動的なビジュアルへと変容します。

## 技術スタック

| レイヤー | 技術 |
|---|---|
| インタラクション | Unity / C# |
| 流体シミュレーション | Compute Shader |
| AI推論 | Python / FastAPI / SAM2 |
| 通信 | HTTP POST / WebSocket |
| iPad UI | JavaScript / HTML / CSS |

## システム構成

iPadとPCが3つのポートを通じて接続されています。
 
| ポート | 通信方式 | 役割 |
|---|---|---|
| 8000 | HTTP | iPad UIの配信 |
| 5000 | HTTP | SAM2によるAI推論（画像・座標を送信し、マスク画像を受け取る） |
| 8080 | WebSocket | Apple Pencilの座標・筆圧のリアルタイム送信 |

## 流体シミュレーション

格子法（Eulerian法）とパーティクルのハイブリッド構成を採用しています。格子法単体では色情報の移流時に隣接ピクセルと混合され写真が濁るため、速度場の計算はグリッド上で行い、色情報を保持したパーティクルがその結果を受け取って移流する2層設計にしています。SAM2が生成したマスク画像をグリッドの境界条件として適用することで、主役のシルエットを保ちながら背景だけが流体として振る舞います。

## セットアップ

### 必要環境

- Unity 6000.3.11 (Unity6.3LTS)
- Python 3.10+
- SAM2（[公式リポジトリ](https://github.com/facebookresearch/segment-anything-2)の手順に従ってインストール）

### SAM2チェックポイント
 
SAM2のセットアップ完了後、チェックポイントを以下のパスに配置してください。
 
```
PythonServer/
└── checkpoints/
    └── sam2.1_hiera_tiny.pt
```
 
> `checkpoints/`フォルダおよび`.venv/`フォルダは`.gitignore`に含まれているため、各自で用意してください。
 
### 起動
 
**1. Pythonサーバーの起動**
 
```bash
cd FluidCanvas/PythonServer
.venv\Scripts\activate
uvicorn main:app --host 0.0.0.0 --port 5000 --reload
```
 
**2. Unityプロジェクトを起動**
 
UnityでプロジェクトをPlayモードで実行
 
**3. iPadから接続**
 
iPadのブラウザからPCのIPアドレス（ポート8000）にアクセス
