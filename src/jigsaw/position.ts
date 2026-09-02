export interface Position {
  readonly row: number;
  readonly column: number;
}

export function samePosition(left: Position, right: Position): boolean {
  return left.row === right.row && left.column === right.column;
}
