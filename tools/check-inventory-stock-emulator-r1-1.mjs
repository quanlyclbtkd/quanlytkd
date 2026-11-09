#!/usr/bin/env node
// Acceptance only: actual Rules, actual browser SDK10 and frozen InventoryService.
import {runAcceptance} from './inventory-stock-r1-1/acceptance.mjs';
await runAcceptance();
