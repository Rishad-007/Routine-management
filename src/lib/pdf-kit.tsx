import React from "react";
import { StyleSheet, Text, View } from "@react-pdf/renderer";

/**
 * Shared building blocks for the school's printed PDFs.
 *
 * The important part is the pagination model: react-pdf repeats a `fixed`
 * element on every page of the `<Page>` that contains it, and it does NOT reset
 * when a table ends. That means a document may only carry ONE repeating table
 * header per `<Page>`, otherwise the header of the last table bleeds onto every
 * continuation page. So each report either splits its tables across separate
 * `<Page>` elements — one header per page — or, when several small tables must
 * share a page, wraps each one in a `wrap={false}` block and turns `repeat` off.
 * Rows then always break cleanly, never mid-record.
 */

export const PDF_CREDIT =
  "Software by Rishad Nur & CPSCR ICT department (School)";

export const pdf = StyleSheet.create({
  page: {
    padding: 24,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#334155",
  },
  pageLandscape: {
    padding: 20,
    fontFamily: "Helvetica",
    fontSize: 8,
    color: "#334155",
  },
  schoolName: {
    textAlign: "center",
    fontWeight: "bold",
    fontSize: 13,
    color: "#1e3a5f",
    marginBottom: 2,
  },
  docTitle: {
    textAlign: "center",
    fontWeight: "bold",
    fontSize: 11,
    color: "#0d9488",
    marginBottom: 2,
  },
  docSubtitle: {
    textAlign: "center",
    fontSize: 9,
    color: "#334155",
  },
  notice: {
    marginTop: 8,
    marginBottom: 10,
    padding: 6,
    borderWidth: 0.5,
    borderColor: "#b91c1c",
    backgroundColor: "#fef2f2",
    fontSize: 9,
    fontWeight: "bold",
    color: "#b91c1c",
    textAlign: "center",
  },
  sectionTitle: {
    marginTop: 14,
    marginBottom: 5,
    paddingBottom: 3,
    borderBottomWidth: 0.75,
    borderBottomColor: "#1e3a5f",
    fontSize: 10,
    fontWeight: "bold",
    color: "#1e3a5f",
  },
  sectionNote: {
    marginBottom: 5,
    fontSize: 7,
    color: "#64748b",
  },
  row: { flexDirection: "row" },
  rowStriped: { backgroundColor: "#f8fafc" },
  headCell: {
    borderStyle: "solid",
    borderWidth: 0.5,
    borderColor: "#cbd5e1",
    paddingVertical: 5,
    paddingHorizontal: 4,
    fontSize: 7.5,
    fontWeight: "bold",
    color: "#1e3a5f",
    backgroundColor: "#e2e8f0",
  },
  bodyCell: {
    borderStyle: "solid",
    borderWidth: 0.5,
    borderColor: "#cbd5e1",
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontSize: 7.5,
    color: "#334155",
  },
  cellStrong: { fontWeight: "bold", color: "#1e3a5f" },
  cellMuted: { color: "#94a3b8" },
  cellTiny: { fontSize: 6.5 },
  empty: {
    marginTop: 10,
    padding: 12,
    borderWidth: 0.5,
    borderStyle: "dashed",
    borderColor: "#cbd5e1",
    textAlign: "center",
    fontSize: 8,
    color: "#94a3b8",
  },
  footer: {
    position: "absolute",
    bottom: 10,
    left: 24,
    right: 24,
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 0.5,
    borderTopColor: "#e2e8f0",
    paddingTop: 3,
  },
  footerText: { fontSize: 6, color: "#b0b7c0" },
  pageNumber: {
    marginLeft: "auto",
    fontSize: 7,
    color: "#94a3b8",
  },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap" },
  summaryCell: {
    width: "25%",
    paddingVertical: 5,
    paddingHorizontal: 6,
    marginBottom: 4,
    marginRight: 4,
    borderWidth: 0.5,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
  },
  summaryLabel: {
    fontSize: 6.5,
    letterSpacing: 0.3,
    color: "#94a3b8",
    textTransform: "uppercase",
  },
  summaryValue: {
    marginTop: 1,
    fontSize: 13,
    fontWeight: "bold",
    color: "#1e3a5f",
  },
  summaryHint: { fontSize: 6, color: "#94a3b8" },
  groupHeading: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginTop: 9,
    paddingBottom: 2,
    paddingLeft: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#0d9488",
  },
  groupHeadingName: { fontSize: 9, fontWeight: "bold", color: "#1e3a5f" },
  groupHeadingMeta: { marginLeft: "auto", fontSize: 7, color: "#64748b" },
});

export type ColAlign = "left" | "center" | "right";

export interface PdfCol {
  label: string;
  width: string;
  align?: ColAlign;
}

/** Document chrome shown once, on the first page only. */
export function DocHeader({
  schoolName,
  title,
  subtitle,
}: {
  schoolName: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <View>
      <Text style={pdf.schoolName}>{schoolName}</Text>
      <Text style={pdf.docTitle}>{title}</Text>
      {subtitle ? <Text style={pdf.docSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={pdf.sectionTitle}>{children}</Text>;
}

export function SectionNote({ children }: { children: React.ReactNode }) {
  return <Text style={pdf.sectionNote}>{children}</Text>;
}

/**
 * The column header row.
 *
 * `repeat` (default true) makes it page furniture: react-pdf repeats it on every
 * continuation page of the enclosing `<Page>`, which is what a long single table
 * needs. Pass `repeat={false}` inside a `wrap={false}` block when several small
 * tables share one page — each block then stays whole (heading + header + rows)
 * and simply flows to the next page when the current one is full.
 */
export function TableHeader({
  cols,
  repeat = true,
}: {
  cols: PdfCol[];
  repeat?: boolean;
}) {
  return (
    <View style={pdf.row} fixed={repeat} wrap={false}>
      {cols.map((c) => (
        <View
          key={c.label}
          style={[pdf.headCell, { width: c.width, textAlign: c.align ?? "left" }]}
        >
          <Text>{c.label}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * One table row. `wrap={false}` makes the row atomic so a record is never split
 * across two pages — the page break always lands cleanly between rows.
 *
 * Cells are plain strings on purpose. A `<Text>` with several children becomes
 * several runs, and react-pdf's hyphenation pass then treats each run boundary
 * as a break opportunity and paints a "-" there — which turns
 * `Abul Kalam Azad (352)` into `Abul Kalam Azad (-` / `352)` whenever the cell is
 * narrow enough to wrap. One string per cell keeps a single run, so wrapping
 * only ever happens at real spaces.
 */
export function TableRow({
  cells,
  cols,
  striped = false,
  strongFirst = false,
}: {
  /** Positional cell contents, one per column. */
  cells: string[];
  cols: PdfCol[];
  striped?: boolean;
  strongFirst?: boolean;
}) {
  return (
    <View
      style={[
        pdf.row,
        ...(striped ? [pdf.rowStriped] : []),
      ]}
      wrap={false}
    >
      {cols.map((c, i) => (
        <View
          key={c.label}
          style={[
            pdf.bodyCell,
            { width: c.width, textAlign: c.align ?? "left" },
            ...(strongFirst && i === 0 ? [pdf.cellStrong] : []),
          ]}
        >
          <Text>{cells[i]}</Text>
        </View>
      ))}
    </View>
  );
}

/** Footer with the school credit and `Page X of Y`, repeated on every page. */
export function DocFooter({ note }: { note?: string }) {
  return (
    <View style={pdf.footer} fixed>
      <Text style={pdf.footerText}>
        {`${note ?? "Cantonment Public School & College, Rangpur"} · ${PDF_CREDIT}`}
      </Text>
      <Text
        style={pdf.pageNumber}
        render={({ pageNumber, totalPages }) =>
          totalPages ? `Page ${pageNumber} of ${totalPages}` : `Page ${pageNumber}`
        }
      />
    </View>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <Text style={pdf.empty}>{children}</Text>;
}

/** Small uppercase label above a number, used in the executive summary. */
export function SummaryCell({
  label,
  value,
  hint,
  width = "25%",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  width?: string;
}) {
  return (
    <View style={[pdf.summaryCell, { width }]}>
      <Text style={pdf.summaryLabel}>{label}</Text>
      <Text style={pdf.summaryValue}>{value}</Text>
      {hint ? <Text style={pdf.summaryHint}>{hint}</Text> : null}
    </View>
  );
}