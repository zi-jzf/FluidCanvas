Shader "CustomRenderTexture/FeedbackFade"
{
    HLSLINCLUDE

    #pragma vertex Vert
    #pragma fragment Frag
    #pragma target 4.5

    #include "Packages/com.unity.render-pipelines.high-definition/Runtime/RenderPipeline/RenderPass/CustomPass/CustomPassCommon.hlsl"

    float _FadeRate; // 外部から渡す減衰率 (0.0 ~ 1.0)
    float _AdvectionStrength;
    float _Diffusion;

    // C#から渡されるキャンバスの画面上での矩形 (xy = 左下のUV, zw = 幅と高さ)
    float4 _CanvasScreenRect;

    TEXTURE2D_X(_FeedbackBuffer); //CustomPassのカラーバッファなのでTEXTURE2D_X
    TEXTURE2D(_VelocityField); //風のテクスチャ
    SAMPLER(sampler_VelocityField);

    //画面外のサンプリングを完全に遮断する関数
    float4 SampleFeedback(float2 uv)
    {
        if(uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0)
            return float4(0, 0, 0, 0);
        return SAMPLE_TEXTURE2D_X(_FeedbackBuffer, s_linear_clamp_sampler, uv);
    }

    float4 Frag(Varyings varyings) : SV_Target
    {
        //CustomPassCommon.hlslに定義されている関数で画面のUVを取得
        float depth;
        PositionInputs posInput = GetPositionInput(varyings.positionCS.xy, _ScreenSize.zw, depth, UNITY_MATRIX_I_VP, UNITY_MATRIX_V);
        float2 screenUV = posInput.positionNDC;

        // ゼロ除算防止（カメラが真横を向いた場合など）
        if (_CanvasScreenRect.z <= 0.0001 || _CanvasScreenRect.w <= 0.0001) return float4(0,0,0,0);

        // 1. 現在のスクリーンUVが、流体キャンバス上のどこ(0.0~1.0)に該当するか変換
        float2 fluidUV = (screenUV - _CanvasScreenRect.xy) / _CanvasScreenRect.zw;

        // 2. キャンバスの外側（余裕を持たせた-0.05〜1.05の外）は計算を打ち切り、完全に黒を出力
        // これにより背景のVRAMゴミのチラつきを完全に遮断します
        if(fluidUV.x < -0.05 || fluidUV.x > 1.05 || fluidUV.y < -0.05 || fluidUV.y > 1.05)
        {
            return float4(0, 0, 0, 0);
        }

        // 3. 流体UV空間での風(Velocity)のサンプリング
        float2 vel = float2(0.0, 0.0);
        if(fluidUV.x >= 0.0 && fluidUV.x <= 1.0 && fluidUV.y >= 0.0 && fluidUV.y <= 1.0)
        {
            vel = SAMPLE_TEXTURE2D(_VelocityField, sampler_VelocityField, fluidUV).xy;
        }

        // 4. 流体UV空間のまま移流（風に流される前の過去のUVを計算）
        float2 prevFluidUV = fluidUV - vel * _AdvectionStrength;

        // 5. 過去の流体UVを、サンプリング用のスクリーンUVに逆変換
        float2 prevScreenUV = prevFluidUV * _CanvasScreenRect.zw + _CanvasScreenRect.xy;

        // 6. スクリーンUVを基準に簡易Blur (Diffusion)
        float aspect = _ScreenSize.y / _ScreenSize.x;
        float2 offset = float2(_Diffusion * aspect, _Diffusion);
        
        float4 color = SampleFeedback(prevScreenUV) * 0.34;
        color += SampleFeedback(prevScreenUV + float2(offset.x, 0.0)) * 0.165;
        color += SampleFeedback(prevScreenUV + float2(-offset.x, 0.0)) * 0.165;
        color += SampleFeedback(prevScreenUV + float2(0.0, offset.y)) * 0.165;
        color += SampleFeedback(prevScreenUV + float2(0.0, -offset.y)) * 0.165;

        // 7. HDR特有のバグ対策: NaNやInfinityが発生した場合は黒にリセットして伝播を防ぐ
        if (any(isnan(color)) || any(isinf(color))) 
        {
            return float4(0, 0, 0, 0);
        }

        // 8. 乗算で減衰
        color.rgb *= _FadeRate;
        color.a *= _FadeRate;
        
        // 黒残り防止
        color = max(color - 0.005, 0.0);

        return color;
    }

    ENDHLSL

    SubShader
    {
        Pass
        {
            Name "Fade Pass"

            ZWrite Off
            ZTest Always
            Blend Off
            Cull Off

            HLSLPROGRAM
            ENDHLSL
        }
    }
}
