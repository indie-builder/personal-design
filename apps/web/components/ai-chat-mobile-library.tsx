'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { openuiLibrary, type EditableTableColumn } from '@openuidev/react-ui';
import { uniqueOpenUiReferences } from '@/lib/openui-content';
import { Button } from './button';
import styles from './ai-chat-ui.module.css';

function useMobileField(
  name: string,
  value: unknown,
  validationRules: Parameters<typeof parseStructuredRules>[0],
  dateRange = false,
) {
  const field = useStateField(name, value);
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
    invalid: !!validation?.errors[field.name],
    change: (next: unknown) => {
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
        disabled={field.streaming}
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
              disabled={field.streaming}
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
              disabled={field.streaming}
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
        disabled={field.streaming}
        value={dateValue(field.value)}
        onChange={(e) => field.change(e.target.value)}
      />
    );
  },
});

type EditableRow = { id: string; values: (string | number)[] };
const EditableTable = defineComponent({
  ...openuiLibrary.components.EditableTable!,
  component: function MobileEditableTable({ props }) {
    const field = useStateField(props.name, props.data);
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
      <div className={styles.mobileEditable} data-mobile-editable>
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
                      disabled={streaming}
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
                      disabled={streaming}
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
              disabled={streaming}
              onClick={() => {
                trigger(`请根据我更新的${props.name || '条目'}继续`);
                setBaseline(snapshot);
              }}
            >
              确认修改
            </Button>
            <Button
              variant="default"
              disabled={streaming}
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

const adaptations = { Select, DatePicker, EditableTable };
export const mobileOpenuiLibrary = createLibrary({
  root: 'Stack',
  components: Object.values(openuiLibrary.components).map((component) => {
    if (component.name in adaptations)
      return adaptations[component.name as keyof typeof adaptations];
    if (
      ![
        'Stack',
        'Card',
        'Buttons',
        'OverviewCardBlock',
        'OptionCards',
        'IconText',
        'BarChart',
        'LineChart',
        'AreaChart',
        'HorizontalBarChart',
        'RadarChart',
        'ScatterChart',
      ].includes(component.name)
    )
      return component;
    const Original = component.component;
    return defineComponent({
      ...component,
      component: ({ props, ...rest }) => (
        <Original
          {...rest}
          props={{
            ...props,
            ...(['Stack', 'Card'].includes(component.name)
              ? {
                  children: uniqueOpenUiReferences(props.children),
                  direction: 'column',
                  wrap: false,
                  gap: 'm',
                  ...(component.name === 'Card' ? { variant: 'clear' } : {}),
                }
              : {}),
            ...(component.name === 'Buttons'
              ? { direction: 'row', buttons: actionHierarchy(props.buttons) }
              : {}),
            ...(component.name === 'IconText'
              ? { layout: 'horizontal', iconVariant: 'neutral', iconSize: 's' }
              : {}),
            ...(component.name === 'OverviewCardBlock' ? { layout: 'grid', responsive: true } : {}),
            ...([
              'BarChart',
              'LineChart',
              'AreaChart',
              'HorizontalBarChart',
              'RadarChart',
              'ScatterChart',
            ].includes(component.name)
              ? { height: 240 }
              : {}),
          }}
        />
      ),
    });
  }),
});
