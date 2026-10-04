import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { Promo, TOTAL } from './Promo';
const Root = () => <Composition id="PersonalSitePromo" component={Promo} durationInFrames={TOTAL} fps={30} width={1920} height={1080}/>;
registerRoot(Root);
