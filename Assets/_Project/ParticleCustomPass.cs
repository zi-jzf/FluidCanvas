using UnityEngine;
using UnityEngine.Rendering.HighDefinition;
using UnityEngine.Rendering;
using UnityEngine.Experimental.Rendering;

[System.Serializable]
public class ParticleCustomPass : CustomPass
{
    public FluidSimulationManager fluidManager;
    public Material particleMaterial;

    [Header("Feedback Settings")]
    public Material fadeMaterial;
    [Range(0.0f, 1.0f)]
    public float fadeRate = 0.9f;
    [Range(0.0f, 0.1f)]
    public float advectionStrength = 0.01f; //風に乗って流れる速さ
    [Range(0.0f, 0.01f)]
    public float diffusion = 0.002f; //Blurの半径・拡散の強さ

    //過去フレームを保持するためのPing-Pongバッファ
    private RTHandle feedbackBufferA;
    private RTHandle feedbackBufferB;
    private bool isEvenFrame = true;

    protected override void Setup(ScriptableRenderContext renderContext, CommandBuffer cmd)
    {
        //画面解像度に合わせてバッファを生成
        feedbackBufferA = RTHandles.Alloc(
            Vector2.one, TextureXR.slices, dimension: TextureXR.dimension,
            colorFormat: GraphicsFormat.R16G16B16A16_SFloat, //HDR対応
            useDynamicScale: true, name: "Feedback Buffer A"
        );

        feedbackBufferB = RTHandles.Alloc(
            Vector2.one, TextureXR.slices, dimension: TextureXR.dimension,
            colorFormat: GraphicsFormat.R16G16B16A16_SFloat, //HDR対応
            useDynamicScale: true, name: "Feedback Buffer B"
        );
    }

    protected override void Execute(CustomPassContext ctx)
    {
        //Gameビュー以外では実行しない
        if(ctx.hdCamera.camera.cameraType != CameraType.Game)
            return;

        // 必要な参照が揃っていない、またはバッファが未生成の場合はスキップ
        if (fluidManager == null || particleMaterial == null || fluidManager.ParticleBuffer == null || fadeMaterial == null) 
            return;

        //マテリアルに減衰率・風の強さ・拡散率をセット
        fadeMaterial.SetFloat("_FadeRate", fadeRate);
        fadeMaterial.SetFloat("_AdvectionStrength", advectionStrength);
        fadeMaterial.SetFloat("_Diffusion", diffusion);

        // FluidGridSolverから最新の風テクスチャを取得してシェーダーに渡す
        if(fluidManager.gridSolver != null && fluidManager.gridSolver.velocityTx_A != null)
        {
            fadeMaterial.SetTexture("_VelocityField", fluidManager.gridSolver.velocityTx_A);
        }

        // キャンバスの画面上の領域(Viewport)を計算してシェーダーに渡す
        Camera cam = ctx.hdCamera.camera;
        float canvasAspect = fluidManager.sourceImage != null ? (float)fluidManager.sourceImage.width / fluidManager.sourceImage.height : 1.0f;
        
        // キャンバスの物理サイズ（ワールド空間での半径）
        float halfSizeY = fluidManager.canvasSize * 0.5f;
        float halfSizeX = halfSizeY * canvasAspect;

        // キャンバスの左下と右上のワールド座標 (Z=0)
        Vector3 bottomLeftWS = new Vector3(-halfSizeX, -halfSizeY, 0);
        Vector3 topRightWS = new Vector3(halfSizeX, halfSizeY, 0);

        // カメラを通してスクリーンUV座標(0.0 ~ 1.0)に変換
        Vector3 blScreen = cam.WorldToViewportPoint(bottomLeftWS);
        Vector3 trScreen = cam.WorldToViewportPoint(topRightWS);

        // xy = 左下のスクリーンUV, zw = スクリーン上での幅と高さ
        Vector4 canvasScreenRect = new Vector4(blScreen.x, blScreen.y, trScreen.x - blScreen.x, trScreen.y - blScreen.y);
        fadeMaterial.SetVector("_CanvasScreenRect", canvasScreenRect);

        // Ping-Pongバッファの決定
        RTHandle readBuffer = isEvenFrame ? feedbackBufferA : feedbackBufferB;
        RTHandle writeBuffer = isEvenFrame ? feedbackBufferB : feedbackBufferA;

        //明示的にテクスチャを渡す
        fadeMaterial.SetTexture("_FeedbackBuffer", readBuffer);

        // 1.前フレームの描画結果(readBuffer)を減衰させながら、現在のバッファ(writeBuffer)へ書き込む
        CoreUtils.SetRenderTarget(ctx.cmd, writeBuffer, ClearFlag.None);
        CoreUtils.DrawFullScreen(ctx.cmd, fadeMaterial);

        // 2. 現在のフレームのパーティクルを描画する
        particleMaterial.SetBuffer("_ParticleBuffer", fluidManager.ParticleBuffer);
        ctx.cmd.DrawProceduralIndirect(
            Matrix4x4.identity, 
            particleMaterial, 
            0, 
            MeshTopology.Triangles, 
            fluidManager.ArgsBuffer
        );

        // 3. 完成した writeBuffer の内容を、カメラのカラーバッファ（実際の画面）へコピーする
        CoreUtils.SetRenderTarget(ctx.cmd, ctx.cameraColorBuffer, ClearFlag.None);
        HDUtils.BlitCameraTexture(ctx.cmd, writeBuffer, ctx.cameraColorBuffer);

        // 次フレームのために反転
        isEvenFrame = !isEvenFrame;
    }

    protected override void Cleanup()
    {
        //アロケートしたバッファを解放
        feedbackBufferA?.Release();
        feedbackBufferB?.Release();
    }
}