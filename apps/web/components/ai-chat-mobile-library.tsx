'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type SyntheticEvent,
  type KeyboardEvent,
} from 'react';
import { ChevronDown } from 'lucide-react';
import {
  createLibrary,
  defineComponent,
  parseStructuredRules,
  useFormValidation,
  useIsStreaming,
  useStateField,
  useTriggerAction,
} from '@openuidev/react-lang';
// Share the entry point with ThemeProvider so chart/portal contexts are identical.
import {
  openuiLibrary,
  SliderBlock as OpenUISliderBlock,
  type EditableTableColumn,
} from '@openuidev/react-ui';
import { uniqueOpenUiReferences } from '@/lib/openui-content';
import { Button } from './button';
import styles from './ai-chat-ui.module.css';

export const AnswerReadOnlyContext = createContext(false);

// Disable mutations at their component boundary, not the whole answer.
// Fieldsets handle native controls; capture guards also cover Radix slider spans.
function EditBoundary({ children }: { children: ReactNode }) {
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

const Select = defineComponent({
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
const DatePicker = defineComponent({
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

const Slider = defineComponent({
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

type EditableRow = { id: string; values: (string | number)[] };
const EditableTable = defineComponent({
  ...openuiLibrary.components.EditableTable!,
  component: function MobileEditableTable({ props }) {
    const field = useStateField(props.name, props.data);
    const readOnly = useContext(AnswerReadOnlyContext);
    const streaming = useIsStreaming();
    const trigger = useTriggerAction();
    const columns: EditableTableColumn[] = props.columns || [];
    const rows: EditableRow[] = Array.isArray(field.value) ? field.value : props.data || [];
    const [baseline, setBaseline] = useState<string | null>(null);
    const snapshot = JSON.stringify(rows);
    useEffect(() => {
      if (!streaming && baseline === null) setBaseline(snapshot);
    }, [streaming, baseline, snapshot]);
    function change(rowId: string, index: number, value: string | number) {
      if (readOnly || streaming) return;
      field.setValue(
        rows.map((row) =>
          row.id !== rowId
            ? row
            : { ...row, values: row.values.map((old, i) => (i === index ? value : old)) },
        ),
      );
    }
    const dirty = baseline !== null && baseline !== snapshot;
    return (
      <div
        className={styles.mobileEditable}
        data-mobile-editable
        data-read-only={readOnly || undefined}
      >
        {rows.map((row, index) => (
          <details key={row.id} className={styles.editableItem} open={index === 0}>
            <summary>
              <span>{row.values?.[0] || '编辑条目'}</span>
              <ChevronDown size={18} aria-hidden="true" />
            </summary>
            <div className={styles.editableFields}>
              {columns.map((column, i) => (
                <label key={column.key || i}>
                  {column.header}
                  {column.type === 'select' ? (
                    <select
                      className={styles.mobileControl}
                      aria-label={column.header}
                      disabled={streaming || readOnly}
                      value={String(row.values?.[i] ?? '')}
                      onChange={(e) => change(row.id, i, e.target.value)}
                    >
                      <option value="">请选择</option>
                      {column.options?.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className={styles.mobileControl}
                      aria-label={column.header}
                      type={
                        column.type === 'date-single'
                          ? 'date'
                          : column.type === 'number'
                            ? 'number'
                            : column.type === 'url'
                              ? 'url'
                              : 'text'
                      }
                      inputMode={column.type === 'number' ? 'decimal' : undefined}
                      disabled={streaming || readOnly}
                      value={row.values?.[i] ?? ''}
                      onChange={(e) =>
                        change(
                          row.id,
                          i,
                          column.type === 'number' && Number.isFinite(e.target.valueAsNumber)
                            ? e.target.valueAsNumber
                            : e.target.value,
                        )
                      }
                    />
                  )}
                </label>
              ))}
            </div>
          </details>
        ))}
        {dirty && (
          <div className={styles.mobileEditActions}>
            <Button
              variant="primary"
              disabled={streaming || readOnly}
              onClick={() => {
                trigger(`请根据我更新的${props.name || '条目'}继续`);
                setBaseline(snapshot);
              }}
            >
              确认修改
            </Button>
            <Button
              variant="default"
              disabled={streaming || readOnly}
              onClick={() => field.setValue(JSON.parse(baseline!))}
            >
              撤销修改
            </Button>
          </div>
        )}
      </div>
    );
  },
});

// Keep emphasis semantic without changing action order or payloads.
function actionHierarchy(buttons: unknown) {
  if (!Array.isArray(buttons)) return buttons;
  let hasPrimary = false;
  return buttons.map((button) => {
    if (!button?.props || ![undefined, 'primary'].includes(button.props.variant)) return button;
    const variant = hasPrimary || button.props.type === 'destructive' ? 'secondary' : 'primary';
    if (variant === 'primary') hasPrimary = true;
    return { ...button, props: { ...button.props, variant } };
  });
}

const adaptations = { Select, DatePicker, Slider, EditableTable };
const editableComponents = new Set([
  'Input',
  'TextArea',
  'Select',
  'DatePicker',
  'Slider',
  'CheckBoxGroup',
  'RadioGroup',
  'SwitchGroup',
  'Chips',
  'OptionCards',
  'Button',
  'IconButton',
]);
const actionBlocks = new Set([
  'SnippetCardBlock',
  'OverviewCardBlock',
  'ContextCardBlock',
  'CompositeCardBlock',
  'VisualCardBlock',
]);
const chartBlocks = [
  'BarChart',
  'LineChart',
  'AreaChart',
  'HorizontalBarChart',
  'RadarChart',
  'ScatterChart',
];
// 移动尺度适配：按组件名套用静态覆盖，特殊取值（children/buttons/items）单独处理。
const staticProps: Record<string, Record<string, unknown>> = {
  Stack: { direction: 'column', wrap: false, gap: 'm' },
  Card: { direction: 'column', wrap: false, gap: 'm', variant: 'clear' },
  Buttons: { direction: 'row' },
  IconText: { layout: 'horizontal', iconVariant: 'neutral', iconSize: 's' },
  OverviewCardBlock: { layout: 'grid', responsive: true },
  ...Object.fromEntries(chartBlocks.map((name) => [name, { height: 240 }])),
};
const wrappedComponents = new Set([
  ...Object.keys(staticProps),
  'ListBlock',
  ...actionBlocks,
  ...editableComponents,
]);
export const mobileOpenuiLibrary = createLibrary({
  root: 'Stack',
  components: Object.values(openuiLibrary.components).map((definition) => {
    const component =
      definition.name in adaptations
        ? adaptations[definition.name as keyof typeof adaptations]
        : definition;
    if (!wrappedComponents.has(component.name)) return component;
    const Original = component.component;
    const name = component.name;
    return defineComponent({
      ...component,
      component: function MobileComponent({ props, ...rest }) {
        const readOnly = useContext(AnswerReadOnlyContext);
        const override: Record<string, unknown> = { ...staticProps[name] };
        if (name === 'Stack' || name === 'Card')
          override.children = uniqueOpenUiReferences(props.children);
        if (name === 'Buttons') override.buttons = actionHierarchy(props.buttons);
        if (readOnly && actionBlocks.has(name)) override.action = undefined;
        if (readOnly && name === 'ListBlock')
          override.items = (props.items || []).map((item: { props?: Record<string, unknown> }) => ({
            ...item,
            props: { ...item.props, action: undefined },
          }));
        const content = <Original {...rest} props={{ ...props, ...override }} />;
        return editableComponents.has(name) ? <EditBoundary>{content}</EditBoundary> : content;
      },
    });
  }),
});
