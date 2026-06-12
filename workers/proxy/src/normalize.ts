/**
 * Schnittmengen-/Alignment-Logik für zwei Zeitreihen mit potenziell
 * unterschiedlichen Inception-Daten und Handelstagen.
 */

export interface PriceRow {
  date: string;
  close: number;
}

export interface AlignedSeries {
  /** Erstes Datum, an dem beide Reihen einen Datapoint haben (YYYY-MM-DD). */
  overlapStart: string;
  /** Letztes Datum, an dem beide Reihen einen Datapoint haben (YYYY-MM-DD). */
  overlapEnd: string;
  /** Reihe 1 auf den gemeinsamen Zeitraum + Handelstage zugeschnitten. */
  series1: PriceRow[];
  /** Reihe 2 auf den gemeinsamen Zeitraum + Handelstage zugeschnitten. */
  series2: PriceRow[];
}

/**
 * Schneidet beide Zeitreihen auf ihren gemeinsamen Zeitraum zu und behält nur
 * Handelstage, an denen BEIDE Instrumente einen Kurs haben (synchrone Punkte).
 *
 * Wirft, wenn die Überlappung leer ist oder eine Reihe leer/ungültig ist.
 */
export function alignSeries(a: PriceRow[], b: PriceRow[]): AlignedSeries {
  if (!Array.isArray(a) || a.length === 0) throw new RangeError("Reihe 1 ist leer");
  if (!Array.isArray(b) || b.length === 0) throw new RangeError("Reihe 2 ist leer");

  const sortedA = [...a].sort((x, y) => x.date.localeCompare(y.date));
  const sortedB = [...b].sort((x, y) => x.date.localeCompare(y.date));

  const startA = sortedA[0].date;
  const startB = sortedB[0].date;
  const endA = sortedA[sortedA.length - 1].date;
  const endB = sortedB[sortedB.length - 1].date;

  const overlapStart = startA > startB ? startA : startB;
  const overlapEnd = endA < endB ? endA : endB;

  if (overlapStart > overlapEnd) {
    throw new RangeError(
      `Keine Überlappung: Reihe 1 ${startA}–${endA}, Reihe 2 ${startB}–${endB}`,
    );
  }

  const mapB = new Map(sortedB.map((row) => [row.date, row.close]));
  const series1: PriceRow[] = [];
  const series2: PriceRow[] = [];
  for (const row of sortedA) {
    if (row.date < overlapStart || row.date > overlapEnd) continue;
    const closeB = mapB.get(row.date);
    if (closeB === undefined) continue;
    series1.push(row);
    series2.push({ date: row.date, close: closeB });
  }

  if (series1.length === 0) {
    throw new RangeError(
      `Keine gemeinsamen Handelstage im Überlappungszeitraum ${overlapStart}–${overlapEnd}`,
    );
  }

  return {
    overlapStart: series1[0].date,
    overlapEnd: series1[series1.length - 1].date,
    series1,
    series2,
  };
}
