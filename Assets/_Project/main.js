// 自分のIPアドレスを書く
const PC_IP_ADDRESS = "192.168.11.63";

// --- 状態表示の管理 ---
const statusDiv = document.getElementById("status");
const sendBtn = document.getElementById("send-btn");
let unityConnected = false;
let isInteractionSession = false;

function updateStatus(aiStatus) {
    const unityStatus = unityConnected ? "Connected" : "Disconnected";
    statusDiv.innerText = `Unity: ${unityStatus} | ${aiStatus}`;
    statusDiv.style.color = aiStatus.includes("Error") ? "#ff4444" : "#ffffff";
}

// --- WebSocket (Unity宛て: ポート8080) ---
// ※今回は画像処理がメインですが、接続維持のために残しておきます
const ws = new WebSocket(`ws://${PC_IP_ADDRESS}:8080/pencil`);
ws.onopen = () => { unityConnected = true; updateStatus("AI: Waiting"); };
ws.onclose = () => { unityConnected = false; updateStatus("AI: Waiting"); };

// --- キャンバスと画像の準備 ---
const baseCanvas = document.getElementById("base-canvas");
const maskCanvas = document.getElementById("mask-canvas");
const ctxBase = baseCanvas.getContext("2d");
const ctxMask = maskCanvas.getContext("2d");
const uploadInput = document.getElementById("image-upload");

const modeIndicator = document.getElementById("mode-indicator");

let currentImageBlob = null;

// ① ファイル選択ボタンが押された時の処理
uploadInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    currentImageBlob = file;

    //新しい画像を選んだらAI推論モードに戻す
    isInteractionSession = false;
    modeIndicator.innerText = "Mode: AI Mask Selection";
    sendBtn.classList.remove("active");
    sendBtn.innerText = "Send Mask to Unity";

    const img = new Image();
    img.onload = () => {
        try {
            //最大解像度を3000pxに制限してリサイズ
            const MAX_SIZE = 3000;
            let width = img.width;
            let height = img.height;

            if (width > MAX_SIZE || height > MAX_SIZE) {
                const ratio = Math.min(MAX_SIZE / width, MAX_SIZE / height);
                width = Math.floor(width * ratio);
                height = Math.floor(height * ratio);
                console.log(`Resized to: ${width}x${height}`);
            }

            // 画像の本来の解像度に合わせてキャンバスのサイズを設定
            baseCanvas.width = width;
            baseCanvas.height = height;
            maskCanvas.width = width;
            maskCanvas.height = height;

            // 画像を描画し、マスク表示をリセット
            ctxBase.drawImage(img, 0, 0, width, height);
            ctxMask.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
        } catch (err) {
            alert("描画エラーが発生しました：" + err.message);
        }
    };
    img.onerror = () => {
        alert("iPadによる画像の読み込みに失敗しました。");
    };
    img.src = URL.createObjectURL(file);
});

// タップ・ドラッグの処理(モードによって分岐)
function handlePointerEvent(e, isPressed) {
    e.preventDefault();
    const rect = baseCanvas.getBoundingClientRect();
    let normalizedX = (e.clientX - rect.left) / rect.width;
    let normalizedY = (e.clientY - rect.top) / rect.height;

    //はみ出し補正
    normalizedX = Math.max(0, Math.min(1, normalizedX));
    normalizedY = Math.max(0, Math.min(1, normalizedY));

    if (isInteractionSession) {
        //Unityへペンデータを送信
        if (!unityConnected) return;

        // Unityは左下が(0,0)なのでY軸を反転
        const unityY = 1.0 - normalizedY;

        const payload = {
            x: normalizedX,
            y: unityY,
            pressure: e.pressure || (isPressed ? 0.5 : 0.0),
            tiltX: 0,
            tiltY: 0,
            isPressed: isPressed
        };
        ws.send(JSON.stringify(payload));
    } else {
        if (isPressed && e.type === "pointerdown") {
            requestAISegmentation(normalizedX, normalizedY);
        }
    }
}

//ポインターイベントの登録
baseCanvas.addEventListener("pointerdown", (e) => handlePointerEvent(e, true));
baseCanvas.addEventListener("pointermove", (e) => {
    if (isInteractionSession && e.buttons > 0) handlePointerEvent(e, true);
});
baseCanvas.addEventListener("pointerup", (e) => handlePointerEvent(e, false));
baseCanvas.addEventListener("pointercancel", (e) => handlePointerEvent(e, false));

// PythonへのAI推論リクエスト
async function requestAISegmentation(x, y) {
    if (!currentImageBlob) return;

    updateStatus("AI: Processing...");
    sendBtn.classList.remove("active");

    //元の生ファイルではなくiPad上でリサイズされたCanvas画像を生成して送信
    const blob = await new Promise(resolve => baseCanvas.toBlob(resolve, "image/jpeg", 0.9));

    const formData = new FormData();
    formData.append("file", blob, "image.jpg");
    formData.append("x", x);
    formData.append("y", y);

    try {
        const response = await fetch(`http://${PC_IP_ADDRESS}:5000/segment`,
            {
                method: "POST",
                body: formData
            });

        if (!response.ok) throw new Error("AI Error");

        const maskBlob = await response.blob();
        const maskImg = new Image();
        maskImg.onload = () => {
            ctxMask.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
            ctxMask.drawImage(maskImg, 0, 0, maskCanvas.width, maskCanvas.height);
            updateStatus("AI: Done");
            sendBtn.classList.add("active");
        };
        maskImg.src = URL.createObjectURL(maskBlob);
    } catch (error) {
        updateStatus("AI: Error");
        alert("AIサーバーとの通信に失敗しました。PC側でPythonサーバーが動いているか確認してください。");
    }
}

//Unityへの画像送信
sendBtn.addEventListener("click", () => {
    if (!unityConnected) {
        alert("Unityと接続されていません。");
        return;
    }

    const base64BaseImage = baseCanvas.toDataURL("image/jpeg", 0.8);
    const base64MaskImage = maskCanvas.toDataURL("image/png");

    const payload = {
        type: "image_pair",
        baseImageData: base64BaseImage,
        maskImageData: base64MaskImage
    };

    ws.send(JSON.stringify(payload));

    // 送信成功後、操作モードへ切り替え
    sendBtn.innerText = "Sent!";
    sendBtn.classList.remove("active");
    isInteractionSession = true;
    modeIndicator.innerText = "Mode: Fluid Interaction";
    updateStatus("AI: Waiting");
});