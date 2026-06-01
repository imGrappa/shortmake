$(function () {
  const MAX_RANGES = 5;
  let selectedFile = null;
  let rangeCount = 0;
  let thumbCounter = 0; // global sıra numarası, sıfırlanmaz

  // ── Sağ panel toggle ──
  $("#previewToggle").on("click", function () {
    const collapsed = $("#app").toggleClass("collapsed").hasClass("collapsed");
    $(this).text(collapsed ? "›" : "‹");
    $(this).attr("title", collapsed ? "Önizlemeyi göster" : "Önizlemeyi gizle");
  });

  // ── Sayfa açılınca mevcut dosyaları yükle ──
  loadExistingOutputs();

  function loadExistingOutputs() {
    $.getJSON("/outputs", function (data) {
      if (!data.files || !data.files.length) return;

      // Sağ paneli aç
      $("#app").addClass("split");
      $("#panelPreview").show();
      $("#previewProgress").hide();
      $("#previewPlayer").show();

      data.files.forEach(function (f) {
        thumbCounter++;
        appendThumb(thumbCounter, f.file_id);
      });

      // İlk dosyayı player'a yükle
      loadMainVideo(data.files[0].file_id);
    });
  }

  // ── İlk aralık satırını ekle ──
  addRange();

  // ── Drag & Drop ──
  $("#dropZone")
    .on("dragover", function (e) {
      e.preventDefault();
      $(this).addClass("drag-over");
    })
    .on("dragleave", function () {
      $(this).removeClass("drag-over");
    })
    .on("drop", function (e) {
      e.preventDefault();
      $(this).removeClass("drag-over");
      const file = e.originalEvent.dataTransfer.files[0];
      if (file) setFile(file);
    });

  $("#fileInput").on("change", function () {
    if (this.files[0]) setFile(this.files[0]);
  });

  function setFile(file) {
    selectedFile = file;
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    $("#fileName").text(`${file.name} · ${mb} MB`);
    checkReady();
  }

  // ── Zaman input mask (000000 → 00:00:00) ──
  function applyTimeMask(input) {
    $(input).on("keydown", function (e) {
      // Silme, backspace, tab, ok tuşlarına izin ver
      const allowed = [8, 9, 37, 38, 39, 40, 46];
      if (allowed.includes(e.which)) return;
      // Sadece rakama izin ver
      if (e.which < 48 || e.which > 57) {
        e.preventDefault();
      }
    });

    $(input).on("input", function () {
      // Sadece rakamları al
      const digits = $(this).val().replace(/\D/g, "").slice(0, 6);

      // 6 rakamı HH:MM:SS formatına dönüştür
      let masked = "";
      for (let i = 0; i < digits.length; i++) {
        if (i === 2 || i === 4) masked += ":";
        masked += digits[i];
      }

      $(this).val(masked);
      checkReady();
    });
  }

  // ── Aralık satırı ekle ──
  $("#addRangeBtn").on("click", function () {
    addRange();
  });

  function addRange() {
    if (rangeCount >= MAX_RANGES) return;
    rangeCount++;
    const idx = rangeCount;

    const row = $(`
      <div class="range-row" data-idx="${idx}">
        <div class="range-field">
          <label>Başlangıç ${idx}</label>
          <input type="text" class="start-input" placeholder="00:01:30" />
        </div>
        <div class="range-field">
          <label>Bitiş ${idx}</label>
          <input type="text" class="end-input" placeholder="00:02:15" />
        </div>
        <button class="remove-btn" title="Kaldır">✕</button>
      </div>
    `);

    row.find(".remove-btn").on("click", function () {
      row.remove();
      rangeCount--;
      $("#addRangeBtn").prop("disabled", rangeCount >= MAX_RANGES);
      checkReady();
    });

    row.find("input").each(function () {
      applyTimeMask(this);
    });
    $("#rangesList").append(row);
    $("#addRangeBtn").prop("disabled", rangeCount >= MAX_RANGES);
    checkReady();
  }

  // ── Hazır mı ──
  function checkReady() {
    const hasFile = !!selectedFile;
    const hasRange = $("#rangesList .range-row")
      .toArray()
      .some(function (row) {
        return $(row).find(".start-input").val().trim() && $(row).find(".end-input").val().trim();
      });
    $("#processBtn").prop("disabled", !(hasFile && hasRange));
  }

  // ── İşle ──
  $("#processBtn").on("click", async function () {
    if (!selectedFile) return;

    const ranges = [];
    $("#rangesList .range-row").each(function () {
      const s = $(this).find(".start-input").val().trim();
      const e = $(this).find(".end-input").val().trim();
      if (s && e) ranges.push({ start: s, end: e });
    });

    if (!ranges.length) return;

    // Sağ paneli aç (zaten açıksa sorun yok)
    $("#app").addClass("split");
    $("#panelPreview").show();
    $("#previewProgress").show();
    $("#previewPlayer").show();
    $("#progressSteps").empty();
    $("#processBtn").prop("disabled", true);

    // Yeni shortlar için loading thumbnail'leri ekle
    // Her birinin gerçek thumb-id'sini şimdiden al
    const newThumbs = ranges.map(function () {
      thumbCounter++;
      return thumbCounter;
    });

    newThumbs.forEach(function (num) {
      appendThumbLoading(num);
    });

    // Progress adımlarını ekle
    ranges.forEach(function (_, i) {
      addStep(i, `Short ${newThumbs[i]} bekleniyor...`, "pending");
    });

    updateProgress(0, ranges.length);

    const fd = new FormData();
    fd.append("video", selectedFile);
    fd.append("ranges", JSON.stringify(ranges));

    setStep(0, "Video yükleniyor...", "active");

    let data;
    try {
      const res = await fetch("/process-multiple", { method: "POST", body: fd });
      data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Sunucu hatası.");
    } catch (err) {
      setStep(0, `Hata: ${err.message}`, "error");
      $("#processBtn").prop("disabled", false);
      return;
    }

    let doneCount = 0;
    for (const r of data.results) {
      const num = newThumbs[r.index];
      if (r.error) {
        setStep(r.index, `Short ${num}: ${r.error}`, "error");
        replaceThumbWithError(num);
      } else {
        setStep(r.index, `Short ${num} tamamlandı — ${r.size_mb} MB`, "done");
        replaceThumbWithVideo(num, r.file_id);
        doneCount++;
      }
      updateProgress(doneCount, ranges.length);
    }

    // İlk başarılı yeni short'u player'a yükle
    const first = data.results.find((r) => r.file_id);
    if (first) loadMainVideo(first.file_id);

    $("#processBtn").prop("disabled", false);
  });

  // ── Progress ──
  function updateProgress(done, total) {
    const pct = total ? Math.round((done / total) * 100) : 0;
    $("#progressFill").css("width", pct + "%");
    $("#progressTitle").text(`İşleniyor... ${done}/${total}`);
    if (done === total) $("#progressTitle").text(`Tamamlandı ✓`);
  }

  function addStep(idx, text, state) {
    const icon = { done: "✓", error: "✗", active: "⟳", pending: "○" }[state] || "○";
    $("<div>").addClass(`step-item ${state}`).attr("id", `step-${idx}`).text(`${icon}  ${text}`).appendTo("#progressSteps");
  }

  function setStep(idx, text, state) {
    const icon = { done: "✓", error: "✗", active: "⟳", pending: "○" }[state] || "○";
    $(`#step-${idx}`).attr("class", `step-item ${state}`).text(`${icon}  ${text}`);
  }

  // ── Thumbnail helpers ──
  function appendThumbLoading(num) {
    $(`<div class="thumb-loading" id="thumb-wrap-${num}">
        <div class="spinner"></div>
        <span>Short ${num}</span>
      </div>`).appendTo("#thumbList");
    scrollThumbEnd();
  }

  function appendThumb(num, fileId) {
    const item = $(`
      <div class="thumb-item" id="thumb-wrap-${num}">
        <video src="/preview/${fileId}" muted preload="metadata"></video>
        <div class="thumb-label">Short ${num}</div>
      </div>
    `);
    item.on("click", function () {
      $(".thumb-item").removeClass("active");
      item.addClass("active");
      loadMainVideo(fileId);
    });
    $("#thumbList").append(item);
    scrollThumbEnd();
  }

  function replaceThumbWithVideo(num, fileId) {
    const item = $(`
      <div class="thumb-item" id="thumb-wrap-${num}">
        <video src="/preview/${fileId}" muted preload="metadata"></video>
        <div class="thumb-label">Short ${num}</div>
      </div>
    `);
    item.on("click", function () {
      $(".thumb-item").removeClass("active");
      item.addClass("active");
      loadMainVideo(fileId);
    });
    $(`#thumb-wrap-${num}`).replaceWith(item);
  }

  function replaceThumbWithError(num) {
    $(`#thumb-wrap-${num}`).replaceWith(
      `<div class="thumb-loading" style="border-color:var(--error)">
         <span style="color:var(--error)">✗ Hata</span>
       </div>`,
    );
  }

  function scrollThumbEnd() {
    const el = $("#thumbList")[0];
    if (el) el.scrollLeft = el.scrollWidth;
  }

  // ── Ana video ──
  function loadMainVideo(fileId) {
    $("#mainVideo").attr("src", `/preview/${fileId}`)[0].load();
    $("#downloadBtn").attr("href", `/download/${fileId}`).attr("download", fileId);

    $(".thumb-item").each(function () {
      const src = $(this).find("video").attr("src") || "";
      $(this).toggleClass("active", src.includes(fileId));
    });
  }
});
