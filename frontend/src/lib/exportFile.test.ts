import { describe, expect, it } from "vitest";
import { toCsv } from "./exportFile";

describe("toCsv", () => {
  it("starts with a BOM, quotes commas, quotes and new lines, and leaves blanks empty", () => {
    const csv = toCsv([["Role", "Skills"], ["Data entry clerk", "Excel, data entry"], ['Say "hi"', null], ["数据录入员", 3]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe('﻿Role,Skills\r\nData entry clerk,"Excel, data entry"\r\n"Say ""hi""",\r\n数据录入员,3\r\n');
  });
});
