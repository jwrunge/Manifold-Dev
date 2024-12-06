import { stProx } from "./util";

if (!MFLD)
  MFLD = {
    st: new Map(),
    els: new Map(),
    $st: stProx(),
    $fn: {},
    comp: {},
  };
