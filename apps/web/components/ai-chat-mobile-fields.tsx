'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
  type SyntheticEvent,
  type KeyboardEvent,
} from 'react';
import {
  defineComponent,
  parseStructuredRules,
  useFormValidation,
  useIsStreaming,
  useStateField,
} from '@openuidev/react-lang';
// Share the entry point with ThemeProvider so chart/portal contexts are identical.
import { openuiLibrary, SliderBlock as OpenUISliderBlock } from '@openuidev/react-ui';
import styles from './ai-chat-ui.module.css';

export const AnswerReadOnlyContext = createContext(false);

// Disable mutations at their component boundary, not the whole answer.
// Fieldsets handle native controls; capture guards also cover Radix slider spans.
export function EditBoundary({ children }: { children: ReactNode }) {
  const readOnly = useContext(AnswerReadOnlyContext);
  const block = (event: SyntheticEvent) => {
    if (!readOnly) return;
    if (event.type !== 'pointerdown') event.preventDefault();
    event.stopPropagation();
  };
  return (
    <fieldset
      className={styles.editBoundary}
      disabled={readOnly}
      aria-disabled={readOnly || undefined}
      data-edit-boundary=""
      onPointerDownCapture={block}
      onClickCapture={block}
      onChangeCapture={block}
      onKeyDownCapture={(event: KeyboardEvent) => {
        if (event.key !== 'Tab') block(event);
      }}
    >
      {children}
    </fieldset>
  );
}

function useMobileField(
  name: string,
  value: unknown,
  validationRules: Parameters<typeof parseStructuredRules>[0],
  dateRange = false,
) {
  const field = useStateField(name, value);
  const readOnly = useContext(AnswerReadOnlyContext);
  const streaming = useIsStreaming();
  const validation = useFormValidation();
  const rangeValue = field.value;
  const completeRange =
    !dateRange ||
    (!!rangeValue &&
      typeof rangeValue === 'object' &&
      'from' in rangeValue &&
      'to' in rangeValue &&
      !!rangeValue.from &&
      !!rangeValue.to &&
      String(rangeValue.from) <= String(rangeValue.to));
  const rules = useMemo(() => parseStructuredRules(validationRules), [validationRules]);
  useEffect(() => {
    if (streaming || !rules.length || !validation) return;
    validation.registerField(field.name, rules, () => (completeRange ? field.value : undefined));
    return () => validation.unregisterField(field.name);
  }, [field.name, field.value, rules, streaming, validation, completeRange]);
  return {
    ...field,
    streaming,
    disabled: streaming || readOnly,
    invalid: !!validation?.errors[field.name],
    validate: (value: unknown) => validation?.validateField(field.name, value, rules),
    change: (next: unknown) => {
      if (readOnly || streaming) return;
      field.setValue(next);
      validation?.clearFieldError(field.name);
    },
  };
}

export const Select = defineComponent({
  ...openuiLibrary.components.Select!,
  component: function MobileSelect({ props }) {
    const field = useMobileField(props.name, props.value, props.rules);
    const items: { props: { value: string; label?: string } }[] = props.items || [];
    return (
      <select
        className={styles.mobileControl}
        id={field.name}
        name={field.name}
        aria-label={props.name}
        aria-invalid={field.invalid}
        disabled={field.disabled}
        value={String(field.value ?? '')}
        onChange={(e) => field.change(e.target.value)}
      >
        <option value="">{props.placeholder || '请选择'}</option>
        {items
          .filter((item) => item?.props?.value)
          .map((item) => (
            <option key={item.props.value} value={item.props.value}>
              {item.props.label || item.props.value}
            </option>
          ))}
      </select>
    );
  },
});

function dateValue(value: unknown) {
  return typeof value === 'string'
    ? value.slice(0, 10)
    : value instanceof Date
      ? value.toISOString().slice(0, 10)
      : '';
}
export const DatePicker = defineComponent({
  ...openuiLibrary.components.DatePicker!,
  component: function MobileDatePicker({ props }) {
    const field = useMobileField(props.name, props.value, props.rules, props.mode === 'range');
    if (props.mode === 'range') {
      const range = field.value && typeof field.value === 'object' ? field.value : {};
      const from = dateValue('from' in range ? range.from : null),
        to = dateValue('to' in range ? range.to : null);
      return (
        <div className={styles.mobileRange}>
          <label>
            开始日期
            <input
              className={styles.mobileControl}
              type="date"
              aria-label={`${props.name}开始日期`}
              disabled={field.disabled}
              value={from}
              max={to || undefined}
              onChange={(e) => field.change({ from: e.target.value, to })}
            />
          </label>
          <label>
            结束日期
            <input
              className={styles.mobileControl}
              type="date"
              aria-label={`${props.name}结束日期`}
              disabled={field.disabled}
              value={to}
              min={from || undefined}
              onChange={(e) => field.change({ from, to: e.target.value })}
            />
          </label>
        </div>
      );
    }
    return (
      <input
        className={styles.mobileControl}
        type="date"
        id={field.name}
        name={field.name}
        aria-label={props.name}
        aria-invalid={field.invalid}
        disabled={field.disabled}
        value={dateValue(field.value)}
        onChange={(e) => field.change(e.target.value)}
      />
    );
  },
});

export const Slider = defineComponent({
  ...openuiLibrary.components.Slider!,
  component: function MobileSlider({ props }) {
    const field = useMobileField(props.name, props.value ?? props.defaultValue, props.rules);
    return (
      <OpenUISliderBlock
        name={field.name}
        label={props.label || field.name}
        variant={props.variant}
        min={props.min}
        max={props.max}
        step={props.step}
        defaultValue={field.value as number[] | undefined}
        disabled={field.disabled}
        isStreaming={field.streaming}
        onValueCommit={(values) => {
          if (field.disabled) return;
          field.change(values);
          field.validate(values[0]);
        }}
      />
    );
  },
});
