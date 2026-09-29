/**
 * The operation vocabulary of a print job.
 *
 * One flat, discriminated union so that a renderer can be exhaustive: add an operation and the
 * compiler points at every renderer that needs to handle it. The original library had no such
 * list — its "document model" was a string buffer, and adding a feature meant appending to it
 * and hoping the transports coped.
 */

import type { Alignment, BarcodeType, CutMode, UnderlineMode } from '../escpos/commands.ts'
import type { BarcodeOptions, FontSize, QrcodeOptions } from '../escpos/EscPosEncoder.ts'

export type {
  Alignment,
  BarcodeOptions,
  BarcodeType,
  CutMode,
  FontSize,
  QrcodeOptions,
  UnderlineMode
}

export interface InitializeOperation {
  kind: 'initialize'
}

export interface CodepageOperation {
  kind: 'codepage'
  codepage: string
}

export interface AlignOperation {
  kind: 'align'
  align: Alignment
}

export interface BoldOperation {
  kind: 'bold'
  on: boolean
}

export interface UnderlineOperation {
  kind: 'underline'
  mode: UnderlineMode
}

export interface FontSizeOperation {
  kind: 'fontSize'
  size: FontSize
}

export interface PrintModeOperation {
  kind: 'printMode'
  mode: number
}

export interface TextOperation {
  kind: 'text'
  value: string
}

export interface LineOperation {
  kind: 'line'
  value: string
}

export interface TextBlockOperation {
  kind: 'textBlock'
  value: string
}

export interface NewlineOperation {
  kind: 'newline'
  count: number
}

export interface RuleOperation {
  kind: 'rule'
  character: string
  /** Explicit width, or `undefined` to use the target's paper width. */
  columns: number | undefined
}

export interface KeyValueOperation {
  kind: 'keyValue'
  label: string
  value: string
  columns: number | undefined
}

export interface FeedOperation {
  kind: 'feed'
  lines: number
}

export interface FeedFormOperation {
  kind: 'feedForm'
}

export interface ReleaseOperation {
  kind: 'release'
}

export interface FeedReverseOperation {
  kind: 'feedReverse'
  lines: number
}

export interface CutOperation {
  kind: 'cut'
  mode: CutMode
  lines: number
}

export interface DrawerOperation {
  kind: 'drawer'
  pin: 0 | 1
  onTime: number
  offTime: number
}

export interface BarcodeOperation {
  kind: 'barcode'
  content: string
  type: BarcodeType
  options: BarcodeOptions
}

export interface QrcodeOperation {
  kind: 'qrcode'
  content: string
  options: QrcodeOptions
}

export interface ImageOperation {
  kind: 'image'
  data: number[]
  width: number
  height: number
}

export interface RawOperation {
  kind: 'raw'
  bytes: number[]
}

export type PrintOperation =
  | InitializeOperation
  | CodepageOperation
  | AlignOperation
  | BoldOperation
  | UnderlineOperation
  | FontSizeOperation
  | PrintModeOperation
  | TextOperation
  | LineOperation
  | TextBlockOperation
  | NewlineOperation
  | RuleOperation
  | KeyValueOperation
  | FeedOperation
  | FeedFormOperation
  | ReleaseOperation
  | FeedReverseOperation
  | CutOperation
  | DrawerOperation
  | BarcodeOperation
  | QrcodeOperation
  | ImageOperation
  | RawOperation
