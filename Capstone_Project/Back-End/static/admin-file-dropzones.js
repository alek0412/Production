/**
 * Drag-and-drop onto Layout admin asset boxes (.admin-marketing-slot + input.admin-marketing-file).
 * HTML5 requires preventDefault on dragenter + dragover; do not rely on dataTransfer.types (Safari often omits "Files" until drop).
 */
(function () {
  'use strict';

  function slotFromTarget(target) {
    if (!target || !target.closest) return null;
    return target.closest('.admin-marketing-slot');
  }

  function fileInputInSlot(slot) {
    if (!slot) return null;
    return slot.querySelector('input.admin-marketing-file[type="file"]');
  }

  function leaveSlotCompletely(slot, relatedTarget) {
    if (!relatedTarget) return true;
    try {
      if (slot.contains(relatedTarget)) return false;
    } catch (e) {
      return true;
    }
    return true;
  }

  function setInputFiles(input, fileList) {
    if (!input || !fileList || !fileList.length) return false;
    // Some browsers allow direct assignment from DataTransfer.files.
    try {
      input.files = fileList;
      if (input.files && input.files.length > 0) return true;
    } catch (err) {}
    // Fallback for browsers that support DataTransfer constructor.
    try {
      if (typeof DataTransfer === 'function') {
        var dt = new DataTransfer();
        dt.items.add(fileList[0]);
        input.files = dt.files;
        return input.files && input.files.length > 0;
      }
    } catch (err2) {}
    return false;
  }

  function showDropHint(slot, text) {
    if (!slot) return;
    var status = slot.querySelector('.admin-marketing-status');
    if (!status) return;
    status.textContent = text || '';
    status.style.color = '#92400e';
  }

  function dispatchChange(input) {
    if (!input) return;
    var ev;
    try {
      ev = new Event('change', { bubbles: true });
    } catch (e2) {
      ev = document.createEvent('Event');
      ev.initEvent('change', true, true);
    }
    input.dispatchEvent(ev);
  }

  /** Both dragenter and dragover must be cancelled so the element is a valid drop target. */
  document.addEventListener(
    'dragenter',
    function (e) {
      var slot = slotFromTarget(e.target);
      var input = fileInputInSlot(slot);
      if (!input) return;
      e.preventDefault();
    },
    false
  );

  document.addEventListener(
    'dragover',
    function (e) {
      var slot = slotFromTarget(e.target);
      var input = fileInputInSlot(slot);
      if (!input) return;
      e.preventDefault();
      try {
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      } catch (err) {}
      slot.classList.add('admin-marketing-slot--dragover');
    },
    false
  );

  document.addEventListener(
    'dragleave',
    function (e) {
      var slot = slotFromTarget(e.target);
      if (!fileInputInSlot(slot)) return;
      if (!leaveSlotCompletely(slot, e.relatedTarget)) return;
      slot.classList.remove('admin-marketing-slot--dragover');
    },
    false
  );

  document.addEventListener(
    'drop',
    function (e) {
      var slot = slotFromTarget(e.target);
      var input = fileInputInSlot(slot);
      if (!input) return;
      e.preventDefault();
      e.stopPropagation();
      slot.classList.remove('admin-marketing-slot--dragover');
      var files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files.length) return;
      if (!setInputFiles(input, files)) {
        showDropHint(slot, 'Drag/drop not supported here. Click the file picker, then Save.');
        return;
      }
      showDropHint(slot, '');
      dispatchChange(input);
    },
    false
  );
})();
