import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatAttachmentImageLine,
  insertAttachmentRowsAtIndex,
  insertAttachmentRowsAtSelection,
  parseAttachmentImageLine,
} from './attachmentImage.ts';

const A = '123e4567-e89b-42d3-a456-426614174000';
const B = '123e4567-e89b-42d3-a456-426614174001';

test('attachment image token must occupy the exact whole line', () => {
  assert.deepEqual(parseAttachmentImageLine(`![이미지](todo-attachment:${A})`), { attachmentId: A });
  for (const invalid of [
    `앞 ![이미지](todo-attachment:${A})`,
    `![이미지](todo-attachment:${A}) 뒤`,
    ` ![이미지](todo-attachment:${A})`,
    `![image](todo-attachment:${A})`,
    `![이미지](https://example.com/${A})`,
    '![이미지](todo-attachment:not-a-uuid)',
  ]) assert.equal(parseAttachmentImageLine(invalid), null);
  assert.throws(() => formatAttachmentImageLine('not-a-uuid'));
});

test('selection replacement preserves before/after text and original caret line id', () => {
  let id = 10;
  const result = insertAttachmentRowsAtSelection({
    lines: [{ id: 1, text: '앞선택뒤' }, { id: 2, text: '다음' }],
    lineIndex: 0,
    selectionStart: 1,
    selectionEnd: 3,
    attachmentIds: [A, B],
    makeId: () => ++id,
  });
  assert.deepEqual(result, {
    lines: [
      { id: 11, text: '앞' },
      { id: 12, text: formatAttachmentImageLine(A) },
      { id: 13, text: formatAttachmentImageLine(B) },
      { id: 1, text: '뒤' },
      { id: 2, text: '다음' },
    ],
    caretLineId: 1,
    caret: 0,
  });
});

test('empty selection and trailing newline retain an editable line after images', () => {
  let id = 20;
  const atCaret = insertAttachmentRowsAtSelection({
    lines: [{ id: 1, text: '가😀나' }],
    lineIndex: 0,
    selectionStart: 3,
    selectionEnd: 3,
    attachmentIds: [A],
    makeId: () => ++id,
  });
  assert.deepEqual(atCaret?.lines.map((line) => line.text), [
    '가😀', formatAttachmentImageLine(A), '나',
  ]);

  const afterCode = insertAttachmentRowsAtIndex({
    lines: [{ id: 1, text: '```' }, { id: 2, text: 'code' }, { id: 3, text: '```' }],
    insertionIndex: 3,
    attachmentIds: [A],
    makeId: () => ++id,
  });
  assert.deepEqual(afterCode?.lines.map((line) => line.text), [
    '```', 'code', '```', formatAttachmentImageLine(A), '',
  ]);
});
