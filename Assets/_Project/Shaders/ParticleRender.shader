Shader "CustomRenderTexture/ParticleRender"
{
    Properties
    {
        _ParticleSize("Particle Size", Range(0.001, 0.5)) = 0.05
        _BaseAlpha("Base Alpha", Range(0.01, 1.0)) = 0.8
        _EmissionMultiplier("Emission Multiplier", Range(0.0, 10.0)) = 2.0 //発光の強さ
    }

    SubShader
    {
        Tags { "RenderType"="Opaque" "RenderPipeline"="HDRenderPipeline" }

        Pass
        {
            Name "ForwardOnly"
            Tags { "LightMode" = "ForwardOnly" }
            
            Cull Off
            ZWrite Off
            ZTest Always
            // Premultiplied Alpha
            Blend One OneMinusSrcAlpha

            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 4.5

            #include "Packages/com.unity.render-pipelines.core/ShaderLibrary/Common.hlsl"
            #include "Packages/com.unity.render-pipelines.high-definition/Runtime/ShaderLibrary/ShaderVariables.hlsl"

            float3 rgb2hsv(float3 c){
                float4 K = float4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
                float4 p = lerp(float4(c.bg, K.wz), float4(c.gb, K.xy), step(c.b, c.g));
                float4 q = lerp(float4(p.xyw, c.r), float4(c.r, p.yzx), step(p.x, c.r));
                float d = q.x - min(q.w, q.y);
                float e = 1.0e-10;
                return float3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
            }

            float3 hsv2rgb(float3 c){
                float4 K =float4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
                float3 p = abs(frac(c.xxx + K.xyz) * 6.0 - K.www);
                return c.z * lerp(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
            }

            struct ParticleData {
                float3 position;
                float3 velocity;
                float2 initialUV;
                float4 color;
            };

            StructuredBuffer<ParticleData> _ParticleBuffer;
            float _ParticleSize;
            float _BaseAlpha;
            float _EmissionMultiplier;

            struct Attributes {
                uint vertexID : SV_VertexID;
                uint instanceID : SV_InstanceID;
            };

            struct Varyings {
                float4 positionCS : SV_POSITION;
                float4 color : COLOR;
                float2 uv : TEXCOORD0;
                float speed : TEXCOORD1;
            };

            Varyings vert(Attributes input) {
                Varyings output;
                
                // バッファから該当パーティクルのデータを取得
                ParticleData p = _ParticleBuffer[input.instanceID];

                // 四角形（Quad）の6頂点を生成するためのUV定義
                float2 quadUVs[6] = { float2(0,0), float2(1,0), float2(0,1), float2(0,1), float2(1,0), float2(1,1) };
                output.uv = quadUVs[input.vertexID];
                
                // 中心を原点とするローカル座標系の生成
                float3 localPos = float3((output.uv - 0.5) * _ParticleSize, 0);

                // ビルボード処理: カメラの右方向・上方向ベクトルを取得して適用（常にカメラの方向を向く）
                float3 camRight = UNITY_MATRIX_V[0].xyz;
                float3 camUp    = UNITY_MATRIX_V[1].xyz;
                float3 worldPos = p.position + camRight * localPos.x + camUp * localPos.y;

                //HDRPのCRRに対応するためカメラ相対座標に変換
                float3 cameraRelativePos = GetCameraRelativePositionWS(worldPos);

                // ワールド座標からクリップ空間座標へ変換（HDRP用関数）
                output.positionCS = TransformWorldToHClip(cameraRelativePos);
                output.color = p.color;
                output.speed = length(p.velocity); //速度を取得して渡す

                return output;
            }

            float4 frag(Varyings input) : SV_Target {
                // 1. 円形のマスク作成(中心を濃く。外側が薄い)と基本のアルファ値
                float dist = distance(input.uv, float2(0.5, 0.5));
                float shapeAlpha = smoothstep(0.5, 0.2, dist); // 0.5より外側を消し、内側をぼかす
                float finalAlpha = shapeAlpha * _BaseAlpha;
                
                // 2. 速度の正規化
                float speedFactor = smoothstep(0.0, 2.5, input.speed);

                // 2. RGBをHSVに変換
                float3 hsv = rgb2hsv(input.color.rgb);

                // 3. 速度に応じた彩度と明度のブースト
                hsv.y = clamp(hsv.y + (speedFactor * 0.5), 0.0, 1.0); //彩度を上げる(Max1.0)
                float3 baseRGB = hsv2rgb(hsv);

                // 4. ベースカラーにアルファをかける
                float3 outputRGB = baseRGB * finalAlpha;

                // 5. 速度に応じた加算発光を作る
                float3 glowRGB = baseRGB * (speedFactor * _EmissionMultiplier);

                // 6. ベースカラーに発光成分を足す
                outputRGB += glowRGB;

                return float4(outputRGB,finalAlpha);
            }
            ENDHLSL
        }
    }
}
