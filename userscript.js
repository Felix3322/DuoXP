// ==UserScript==
// @name         Duolingo XP Auto Session (4.1) – Adjustable Delay + XP Accuracy + Safe429
// @namespace    https://duolingo.com/
// @version      4.1
// @description  Auto XP with adjustable interval + precise XP detection + auto 429 protection
// @match        https://www.duolingo.com/*
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    let running = true;
    let locked = false;
    let successCount = 0;
    let totalXP = 0;
    let interval = 3000;   // 默认 3 秒

    // ================= UI：统计面板 =================
    const stats = document.createElement('div');
    stats.id = 'duo-xp-stats-panel';
    stats.innerHTML = `
        <b>Duolingo XP Stats</b><br>
        作者：OB_BUFF<br>
        此脚本免费<br>
        始于：<a href="https://gist.github.com/rfoel" target="_blank" style="color:#0f0;">gist/rfoel</a>
        <hr>
        <div id="duo-stats">
            成功次数: 0<br>
            总XP: 0<br>
            当前间隔: <span id="interval-display">3000</span> ms
        </div>
        <input id="interval-input" type="number" value="3000" min="300"
            style="width:100%;margin-top:5px;background:#222;color:#0f0;border:1px solid #0f0;">
        <button id="apply-interval">设置间隔</button>
        <button id="duo-toggle">⏸ 暂停</button>
    `;
    document.body.appendChild(stats);

    // ================= UI：日志 =================
    const logPanel = document.createElement('div');
    logPanel.id = 'duo-xp-log-panel';
    logPanel.innerHTML = `<b>运行日志</b><br>`;
    document.body.appendChild(logPanel);

    // ================= 样式 =================
    GM_addStyle(`
        #duo-xp-stats-panel {
            position: fixed;
            left: 10px;
            bottom: 10px;
            width: 230px;
            max-height: 360px;
            padding: 10px;
            background: rgba(20,20,20,0.85);
            color: #00ff99;
            font-size: 12px;
            border: 1px solid #0f0;
            border-radius: 6px;
            z-index: 9999999;
            overflow-y: auto;
        }
        #duo-xp-stats-panel button {
            width: 100%;
            margin-top: 5px;
            padding: 6px;
            background: #333;
            color: #0f0;
            border: 1px solid #0f0;
            cursor: pointer;
        }
        #duo-xp-log-panel {
            position: fixed;
            right: 10px;
            bottom: 10px;
            width: 260px;
            max-height: 350px;
            padding: 10px;
            overflow-y: auto;
            background: rgba(20,20,20,0.85);
            color: #00ff99;
            font-size: 12px;
            border: 1px solid #0f0;
            border-radius: 6px;
            z-index: 9999999;
        }
    `);

    function log(msg) {
        logPanel.innerHTML += msg + '<br>';
        logPanel.scrollTop = logPanel.scrollHeight;
    }

    function updateStats() {
        document.getElementById("duo-stats").innerHTML =
            `成功次数: ${successCount}<br>总XP: ${totalXP}<br>当前间隔: ${interval} ms`;
    }

    // ================= 设置间隔 =================
    document.getElementById("apply-interval").onclick = () => {
        const v = Number(document.getElementById("interval-input").value);
        if (v >= 300) {
            interval = v;
            document.getElementById("interval-display").innerText = v;
            log(`✓ 已设置间隔为 ${v} ms`);
        } else {
            log("⚠️ 间隔过短（最低 300 ms）");
        }
    };

    // ================= 暂停 / 恢复 =================
    document.getElementById("duo-toggle").onclick = () => {
        running = !running;
        locked = false;
        document.getElementById("duo-toggle").innerText = running ? "⏸ 暂停" : "▶ 恢复";
        log(running ? "▶ 已恢复执行" : "⏸ 已暂停");
    };

    // ================= 获取语言 =================
    async function getUserInfo() {
        const id = document.cookie
            .split(';')
            .map(e => e.trim())
            .find(e => e.startsWith('logged_out_uuid'))
            ?.split('=')[1];

        if (!id) {
            log("无法找到 logged_out_uuid");
            return null;
        }

        const r = await fetch(
            `https://www.duolingo.com/2017-06-30/users/${id}?fields=fromLanguage,learningLanguage`,
            { credentials: "include" }
        );

        return await r.json();
    }

    // ================= XP 精准解析 =================
    function detectXP(json) {
        if (!json) return 0;

        // 1. 顶层 xpGain
        if (typeof json.xpGain === "number") return json.xpGain;

        // 2. trackingProperties.xp_gained
        if (json.trackingProperties && typeof json.trackingProperties.xp_gained === "number") {
            return json.trackingProperties.xp_gained;
        }

        return 10; // fallback 最低 10
    }

    // ================= 429 警告 =================
    function show429Warning() {
        const msg = `
⚠️ Duolingo 返回 429（风控）

请切换 IP / 手机流量，否则账号和 IP 都可能被标记。

跳过警告继续运行 = 自己承担风险。

是否继续？`;

        const ok = confirm(msg);

        if (ok) {
            log("⚠️ 用户跳过风险警告（账号/IP 不安全）");
            running = true;
            locked = false;
        } else {
            running = false;
            log("⛔ 已暂停，请切换 IP 后再继续");
        }
    }

    // ================= 单次执行 =================
    async function runOnce(fromLang, learnLang) {
        if (!running || locked) return;

        try {
            const create = await fetch("https://www.duolingo.com/2017-06-30/sessions", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    challengeTypes: [],
                    fromLanguage: fromLang,
                    learningLanguage: learnLang,
                    isFinalLevel: false,
                    isV2: true,
                    juicy: true,
                    smartTipsVersion: 2,
                    type: "GLOBAL_PRACTICE"
                })
            });

            if (create.status === 429) {
                locked = true;
                running = false;
                log("⛔ POST 429 — 已暂停");
                return show429Warning();
            }

            const session = await create.json();
            if (!session.id) return log("session.id 缺失");

            const done = await fetch(
                `https://www.duolingo.com/2017-06-30/sessions/${session.id}`,
                {
                    method: "PUT",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        ...session,
                        heartsLeft: 0,
                        startTime: (Date.now() - 60000) / 1000,
                        endTime: Date.now() / 1000,
                        failed: false,
                        enableBonusPoints: false,
                        maxInLessonStreak: 9,
                        shouldLearnThings: true
                    })
                }
            );

            if (done.status === 429) {
                locked = true;
                running = false;
                log("⛔ PUT 429 — 已暂停");
                return show429Warning();
            }

            const result = await done.json();
            const gained = detectXP(result);

            successCount++;
            totalXP += gained;
            updateStats();

            log(`✔ 完成 session ${session.id} (+${gained} XP)`);

        } catch (err) {
            log(`✘ 错误: ${err}`);
        }
    }

    // ================= 主循环（可变间隔） =================
    async function mainLoop(fromLang, learnLang) {
        while (true) {
            await new Promise(r => setTimeout(r, interval));
            runOnce(fromLang, learnLang);
        }
    }

    // ================= 初始化 =================
    async function main() {
        const info = await getUserInfo();
        if (!info) return log("无法初始化用户信息");

        log(`初始化成功：${info.fromLanguage} → ${info.learningLanguage}`);
        log(`默认间隔：${interval} ms`);
        log("开始循环…");

        mainLoop(info.fromLanguage, info.learningLanguage);
    }

    main();
})();
