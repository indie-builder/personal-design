import type { FormSubmission } from '@personal-design/ai-chat';
import { ChevronDown } from 'lucide-react';
import styles from './ai-chat.module.css';

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function field(value: unknown): value is Record<string, unknown> & { value: unknown } {
  return (
    object(value) &&
    'value' in value &&
    Object.keys(value).every((key) => key === 'value' || key === 'componentType')
  );
}
function entries(state: Record<string, unknown>, prefix = ''): [string, unknown][] {
  return Object.entries(state).flatMap(([name, value]) => {
    const label = prefix ? `${prefix} · ${name}` : name;
    if (field(value)) return [[label, value.value]];
    if (object(value) && Object.values(value).some(field)) return entries(value, label);
    return [[label, value]];
  });
}
function readable(value: unknown): string {
  if (value == null || value === '') return '未填写';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (Array.isArray(value))
    return value.length ? value.map(readable).join(value.some(object) ? '\n' : '、') : '未选择';
  if (field(value)) return readable(value.value);
  if (object(value)) {
    if (Array.isArray(value.values)) return value.values.map(readable).join(' / ');
    return Object.entries(value)
      .map(
        ([key, item]) =>
          `${key === 'from' ? '开始' : key === 'to' ? '结束' : key}：${readable(item)}`,
      )
      .join('；');
  }
  return String(value);
}

export function SubmittedForm({ submission }: { submission: FormSubmission }) {
  const fields = entries(submission.formState);
  if (!fields.length) return null;
  return (
    <details className={styles.submission}>
      <summary>
        查看已提交内容（{fields.length}项）
        <ChevronDown size={14} aria-hidden="true" />
      </summary>
      <dl>
        {fields.map(([name, value]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>{readable(value)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
