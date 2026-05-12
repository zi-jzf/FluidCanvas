// 自分のIPアドレスを書く
const PC_IP_ADDRESS = "192.168.11.63";

// --- フェーズ管理 ---
// body のクラスを切り替えて UI の表示・非表示を一括制御する
const uiContainer = document.getElementById("ui-container");

// ステップの順序定義
const PHASE_ORDER = ["upload", "selection", "interaction"];

function setPhase(phase) {
    document.body.className = `phase-${phase}`;
    console.log(`[Phase] → ${phase}`);

    // フェーズ切り替え時にUIコンテナの位置をリセット
    if (phase === "upload") {
        // アップロードフェーズ: CSS の中央配置を使うため inline style をクリア
        uiContainer.style.top = "";
        uiContainer.style.left = "";
        uiContainer.style.transform = "";
    } else if (phase === "selection") {
        // 選択フェーズ: 左上からスタート
        uiContainer.style.top = "10px";
        uiContainer.style.left = "10px";
        uiContainer.style.transform = "none";
    }

    // ステップインジケーターの状態を更新
    updateStepIndicator(phase);
}

function updateStepIndicator(currentPhase) {
    const currentIndex = PHASE_ORDER.indexOf(currentPhase);
    const steps = document.querySelectorAll(".step");
    const lines = document.querySelectorAll(".step-line");

    steps.forEach((step) => {
        const stepPhase = step.dataset.step;
        const stepIndex = PHASE_ORDER.indexOf(stepPhase);
        step.classList.remove("active", "done");

        if (stepIndex < currentIndex) {
            step.classList.add("done");
        } else if (stepIndex === currentIndex) {
            step.classList.add("active");
        }
    });

    lines.forEach((line) => {
        const afterPhase = line.dataset.after;
        const lineIndex = PHASE_ORDER.indexOf(afterPhase);
        line.classList.remove("done");

        if (lineIndex < currentIndex) {
            line.classList.add("done");
        }
    });
}

// --- UIコンテナのドラッグ移動（selection フェーズ専用） ---
(function setupDrag() {
    const handle = document.getElementById("drag-handle");
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    handle.addEventListener("pointerdown", (e) => {
        // selection フェーズ以外ではドラッグ無効
        if (!document.body.classList.contains("phase-selection")) return;

        isDragging = true;
        handle.setPointerCapture(e.pointerId);

        const rect = uiContainer.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;

        e.preventDefault();
        e.stopPropagation();
    });

    handle.addEventListener("pointermove", (e) => {
        if (!isDragging) return;

        let newLeft = e.clientX - offsetX;
        let newTop = e.clientY - offsetY;

        // 画面外にはみ出さないようにクランプ
        const maxLeft = window.innerWidth - uiContainer.offsetWidth;
        const maxTop = window.innerHeight - uiContainer.offsetHeight;
        newLeft = Math.max(0, Math.min(newLeft, maxLeft));
        newTop = Math.max(0, Math.min(newTop, maxTop));

        uiContainer.style.left = newLeft + "px";
        uiContainer.style.top = newTop + "px";
        uiContainer.style.transform = "none";

        e.preventDefault();
        e.stopPropagation();
    });

    handle.addEventListener("pointerup", (e) => {
        isDragging = false;
        e.stopPropagation();
    });

    handle.addEventListener("pointercancel", (e) => {
        isDragging = false;
        e.stopPropagation();
    });
})();

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



const undoBtn = document.getElementById("undo-btn");
const clearBtn = document.getElementById("clear-btn");
let clickPoints = []; //タップした座標データを保持する配列
let latestMaskImage = null; //最新のマスク画像を保持

let currentImageBlob = null;

// ① ファイル選択ボタンが押された時の処理
uploadInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    currentImageBlob = file;

    // リセット処理
    clickPoints = [];
    latestMaskImage = null;

    //新しい画像を選んだらAI推論モードに戻す
    isInteractionSession = false;
    sendBtn.classList.remove("active");
    sendBtn.innerText = "Unityに送信";

    // フェーズを主役選択に遷移
    setPhase("selection");

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
            clickPoints.push({ x: normalizedX, y: normalizedY });
            requestAISegmentation(); //座標を渡さず、配列全体を使ってリクエスト
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

//undoボタン処理
undoBtn.addEventListener("click", () => {
    if (clickPoints.length === 0 || isInteractionSession) return;
    clickPoints.pop(); //最後の一つを削除
    if (clickPoints.length > 0) {
        requestAISegmentation();
    } else {
        //点がゼロになったらキャンバスをクリア
        latestMaskImage = null;
        redrawMaskCanvas();
        sendBtn.classList.remove("active");
        updateStatus("AI: Waiting");
    }
});

clearBtn.addEventListener("click", () => {
    if (isInteractionSession) return;
    clickPoints = [];
    latestMaskImage = null;
    redrawMaskCanvas();
    sendBtn.classList.remove("active");
    updateStatus("AI: Waiting");
});

// マスク画像とタップ位置（赤いマーカー）を重ねて描画する関数
function redrawMaskCanvas() {
    ctxMask.clearRect(0, 0, maskCanvas.width, maskCanvas.height);

    // AIからのマスク画像があれば描画
    if (latestMaskImage) {
        ctxMask.drawImage(latestMaskImage, 0, 0, maskCanvas.width, maskCanvas.height);
    }

    // タップした座標に赤いマーカーを描画
    ctxMask.fillStyle = "rgba(255, 0, 0, 0.8)";
    for (let pt of clickPoints) {
        ctxMask.beginPath();
        ctxMask.arc(pt.x * maskCanvas.width, pt.y * maskCanvas.height, 8, 0, Math.PI * 2);
        ctxMask.fill();
    }
}

// PythonへのAI推論リクエスト
const loadingOverlay = document.getElementById("loading-overlay");

async function requestAISegmentation(x, y) {
    if (!currentImageBlob) return;

    updateStatus("AI: Processing...");
    sendBtn.classList.remove("active");
    loadingOverlay.classList.remove("hidden");

    //元の生ファイルではなくiPad上でリサイズされたCanvas画像を生成して送信
    const blob = await new Promise(resolve => baseCanvas.toBlob(resolve, "image/jpeg", 0.9));

    const formData = new FormData();
    formData.append("file", blob, "image.jpg");
    //配列をJSON文字列に変換して送信
    formData.append("points_json", JSON.stringify(clickPoints));

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
            latestMaskImage = maskImg; //画像を保持
            redrawMaskCanvas(); //画像とマーカーを描画
            updateStatus("AI: Done");
            sendBtn.classList.add("active");
            loadingOverlay.classList.add("hidden");
        };
        maskImg.src = URL.createObjectURL(maskBlob);
    } catch (error) {
        updateStatus("AI: Error");
        loadingOverlay.classList.add("hidden");
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

    // 送信成功後、流体操作フェーズへ切り替え
    sendBtn.innerText = "Sent!";
    sendBtn.classList.remove("active");
    isInteractionSession = true;
    updateStatus("AI: Waiting");

    // フェーズを流体操作に遷移（UIを全非表示にする）
    setPhase("interaction");
});