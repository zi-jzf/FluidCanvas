Shader "CustomRenderTexture/FeedbackFade"
{
    HLSLINCLUDE

    #pragma vertex Vert
    #pragma fragment Frag
    #pragma target 4.5

    #include "Packages/com.unity.render-pipelines.high-definition/Runtime/RenderPipeline/RenderPass/CustomPass/CustomPassCommon.hlsl"

    // 外部から渡す減衰率 (0.0 ~ 1.0)
    float _FadeRate;
    // サンプリングするテクスチャを明示的に定義
    TEXTURE2D_X(_FeedbackBuffer);

    float4 Frag(Varyings varyings) : SV_Target
    {
        //CustomPassCommon.hlslに定義されている関数で画面のUVを取得
        float depth;
        PositionInputs posInput = GetPositionInput(varyings.positionCS.xy, _ScreenSize.zw, depth, UNITY_MATRIX_I_VP, UNITY_MATRIX_V);
        float2 uv = posInput.positionNDC;

        //CustomPassContextのsourceから色を取得
        float4 color = SAMPLE_TEXTURE2D_X(_FeedbackBuffer, s_linear_clamp_sampler, uv);

        //乗算で減衰させる
        color.rgb *= _FadeRate;
        color.a *= _FadeRate;

        //色が完全に残らないように微小な値を引く(黒残り防止)
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
