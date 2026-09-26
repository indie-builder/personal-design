import { defaultLightTheme, type Theme } from '@openuidev/react-ui';

// Map every official typography token to the answer surface's shared semantic scale.
const typography = Object.fromEntries(
  Object.keys(defaultLightTheme)
    .filter((key) => /^text(Body|Heading|Label|Numbers|Code)/.test(key))
    .map((key) => {
      if (key.endsWith('LetterSpacing')) return [key, '0'];
      const role = key.startsWith('textCode')
        ? 'caption'
        : key.startsWith('textHeading')
          ? 'heading'
          : key.startsWith('textNumbersHeading')
            ? 'metric'
            : key.startsWith('textLabel')
              ? 'label'
              : key.includes('Xs')
                ? 'caption'
                : 'body';
      const weight =
        role === 'heading'
          ? 600
          : role === 'metric' || key.includes('Heavy')
            ? 550
            : role === 'label'
              ? 500
              : 400;
      return [
        key,
        `${weight} var(--answer-${role}-size)/${role === 'body' ? 1.65 : 1.5} ${key.startsWith('textCode') ? 'var(--openui-font-code)' : 'var(--font-sans)'}`,
      ];
    }),
);
const shared: Theme = {
  ...typography,
  fontSize2xs: 'var(--answer-caption-size)',
  fontSizeXs: 'var(--answer-caption-size)',
  fontSizeSm: 'var(--answer-label-size)',
  fontSizeMd: 'var(--answer-body-size)',
  fontSizeLg: 'var(--answer-input-size)',
  fontSizeXl: 'var(--answer-heading-size)',
  fontSize2xl: 'var(--answer-heading-size)',
  fontSize3xl: 'var(--answer-metric-size)',
  fontSize4xl: 'var(--answer-metric-size)',
  fontSize5xl: 'var(--answer-metric-size)',
  fontWeightRegular: '400',
  fontWeightMedium: '500',
  fontWeightBold: '600',
  fontWeightHeavy: '600',
  letterSpacingNormal: '0',
  letterSpacingTight: '0',
  letterSpacingTighter: '0',

  fontBody: 'var(--font-sans)',
  fontLabel: 'var(--font-sans)',
  fontHeading: 'var(--font-sans)',
  fontNumbers: 'var(--font-sans)',
  background: 'var(--color-workspace)',
  foreground: 'var(--color-paper)',
  popoverBackground: 'var(--color-paper)',
  textNeutralPrimary: 'var(--color-ink)',
  textNeutralSecondary: 'var(--color-ink-soft)',
  textNeutralTertiary: 'var(--color-ink-soft)',
  textNeutralLink: 'var(--color-ink)',
  textBrand: 'var(--color-ink)',
  infoBackground: 'var(--color-plate)',
  textInfoPrimary: 'var(--color-ink-soft)',
  borderInfo: 'var(--color-hairline-strong)',
  borderInfoEmphasis: 'var(--color-control-border)',
  interactiveAccentDefault: 'var(--color-ink)',
  interactiveAccentHover: 'var(--color-accent)',
  interactiveAccentPressed: 'var(--color-ink)',
  interactiveAccentDisabled: 'var(--color-ink-soft)',
  borderAccent: 'var(--color-control-border)',
  borderAccentEmphasis: 'var(--chat-focus)',
  sunkLight: 'var(--color-plate)',
  sunk: 'var(--color-plate)',
  sunkDeep: 'var(--color-hairline)',
  highlight: 'var(--color-plate)',
  highlightSubtle: 'var(--color-plate)',
  highlightStrong: 'var(--color-plate)',
  highlightIntense: 'var(--color-hairline-strong)',
  textAccentPrimary: 'var(--color-paper)',
  borderDefault: 'var(--color-hairline-strong)',
  borderInteractive: 'var(--color-control-border)',
  borderInteractiveSelected: 'var(--color-ink)',
  space3xs: '4px',
  space2xs: '4px',
  spaceXs: '8px',
  spaceS: '8px',
  spaceSM: '12px',
  spaceM: '12px',
  spaceML: '16px',
  spaceL: '20px',
  spaceXl: '24px',
  space2xl: '32px',
  radiusXs: '6px',
  radiusS: '8px',
  radiusM: '10px',
  radiusL: '12px',
  radiusXl: '12px',
  radius2xl: '12px',
  radius3xl: '12px',
  radiusFull: '9999px',
  shadowS: 'none',
  shadowM: 'none',
  shadowL: 'none',
};
const chartKeys = [
  'defaultChartPalette',
  'barChartPalette',
  'lineChartPalette',
  'areaChartPalette',
  'pieChartPalette',
  'radarChartPalette',
  'radialChartPalette',
  'horizontalBarChartPalette',
] as const satisfies readonly (keyof Theme)[];
const chartPalette = (colors: string[]) =>
  Object.fromEntries(chartKeys.map((key) => [key, colors]));
export const answerLightTheme: Theme = {
  ...shared,
  ...chartPalette(['#526c7b', '#8a9ba7', '#788f7e', '#a18b6e']),
};
export const answerDarkTheme: Theme = {
  ...shared,
  ...chartPalette(['#b0c5d2', '#788f9f', '#a3b9a5', '#c3ac8e']),
};
