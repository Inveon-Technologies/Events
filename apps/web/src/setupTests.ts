import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

// Default is 1000ms. Under real CI/sandbox load — many tests in one
// large file, each doing real async render + fetch-mock + state-update
// cycles — that's tight enough to occasionally time out a genuinely
// passing assertion before its state update actually lands, causing
// an intermittent failure with nothing wrong in the code under test
// (confirmed: the same assertions pass reliably in isolation or small
// groups, and fail only under the full suite's load). Raised here,
// once, for every waitFor/findBy* across the whole suite, rather than
// patched into individual call sites one at a time.
configure({ asyncUtilTimeout: 5000 });
