import React, { useState, useRef } from 'react';
import {
  UploadCloud, FileImage, CheckCircle2, ArrowRight, Camera, X, Loader2,
} from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '../services/api';
import { CameraCapture } from '../components/CameraCapture';
import {
  Panel, Button, Alert, FormField, Select, Field,
} from '../components/ui';

interface NewScanViewProps {
  onScanCreated: (scanId: string) => void;
}

const COMMODITIES = [
  { value: 'FOOD_GRAINS', label: 'Food grains (rice, atta, pulses)' },
  { value: 'EDIBLE_OILS', label: 'Edible oils & vanaspati' },
  { value: 'BISCUITS_CONFECTIONERY', label: 'Biscuits & confectionery' },
  { value: 'TEA_COFFEE', label: 'Tea & coffee' },
  { value: 'SOAP_DETERGENT', label: 'Soaps & detergents' },
  { value: 'BEVERAGES', label: 'Packaged drinking water & beverages' },
  { value: 'GENERAL_PACKAGED_GOODS', label: 'General consumer commodities' },
];

/** Turn transport-level failures into something an inspector can act on. */
const humaniseError = (err: any): string => {
  const raw = typeof err?.message === 'string' ? err.message : '';
  if (/failed to fetch|networkerror|load failed/i.test(raw)) {
    return 'Could not reach the verification service. Check your connection and try again.';
  }
  if (/413|too large/i.test(raw)) {
    return 'That image is too large. Please use a file under 25 MB.';
  }
  if (/415|unsupported|format/i.test(raw)) {
    return 'That file type is not supported. Upload a JPEG, PNG or WebP image.';
  }
  if (/5\d\d/.test(raw)) {
    return 'The verification service could not process this upload. Please try again shortly.';
  }
  return raw || 'Upload failed. Please try again.';
};

export const NewScanView: React.FC<NewScanViewProps> = ({ onScanCreated }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [commodityType, setCommodityType] = useState('FOOD_GRAINS');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<any | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const acceptFile = (file: File) => {
    setSelectedFile(file);
    setError(null);
    setUploadResult(null);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      acceptFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      acceptFile(e.dataTransfer.files[0]);
    }
  };

  const handleCameraCapture = (file: File) => {
    acceptFile(file);
    setShowCamera(false);
  };

  const clearSelection = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setUploadResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Please select or capture a packaged commodity image first.');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const result = await api.uploadScan(selectedFile, commodityType);
      setUploadResult(result);
    } catch (err: any) {
      setError(humaniseError(err));
    } finally {
      setUploading(false);
    }
  };

  const quality = uploadResult?.quality_assessment;

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {showCamera && (
        <CameraCapture onCapture={handleCameraCapture} onClose={() => setShowCamera(false)} />
      )}

      <div>
        <h1 className="text-xl font-semibold text-slate-100 tracking-tight">New inspection</h1>
        <p className="text-sm text-slate-400 mt-1 max-w-2xl">
          Upload a photograph of the Principal Display Panel, front or back of the package.
          Clear, well-lit images produce the most reliable extraction.
        </p>
      </div>

      {error && (
        <Alert tone="fail" title="Upload could not be completed">
          {error}
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">
        {/* Dropzone */}
        <div className="lg:col-span-3 space-y-3">
          <div className="flex gap-2.5">
            <Button
              variant="secondary"
              icon={Camera}
              onClick={() => setShowCamera(true)}
              className="flex-1"
            >
              Use camera
            </Button>
            <Button
              variant="secondary"
              icon={UploadCloud}
              onClick={() => fileInputRef.current?.click()}
              className="flex-1"
            >
              Choose file
            </Button>
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => !previewUrl && fileInputRef.current?.click()}
            className={clsx(
              'relative border border-dashed rounded-lg p-6 text-center transition-colors',
              'flex flex-col items-center justify-center min-h-[300px]',
              dragActive
                ? 'border-gold-500 bg-gold-500/5'
                : 'border-slate-700 bg-gov-850 hover:border-slate-600',
              !previewUrl && 'cursor-pointer',
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              className="hidden"
              aria-label="Package image file"
            />

            {previewUrl ? (
              <div className="w-full space-y-3">
                <div className="relative inline-block max-w-full">
                  <img
                    src={previewUrl}
                    alt="Selected package"
                    className="max-h-64 rounded-md mx-auto border border-slate-700 object-contain"
                  />
                  <button
                    onClick={(e) => { e.stopPropagation(); clearSelection(); }}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gov-800 border border-slate-600 text-slate-300 hover:text-slate-100 hover:bg-gov-700 flex items-center justify-center transition-colors"
                    aria-label="Remove selected image"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
                  <FileImage className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="truncate max-w-[18rem]">{selectedFile?.name}</span>
                  <span className="text-slate-600">·</span>
                  <span className="font-mono tabular-nums">
                    {((selectedFile?.size ?? 0) / 1024).toFixed(1)} KB
                  </span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                  className="text-2xs text-gold-400 hover:text-gold-300 font-medium"
                >
                  Replace image
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="w-11 h-11 rounded-lg bg-gov-800 border border-slate-700 flex items-center justify-center mx-auto text-slate-400">
                  <UploadCloud className="w-5 h-5" aria-hidden="true" />
                </div>
                <p className="text-sm font-medium text-slate-200">
                  Drag an image here, or click to browse
                </p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                  Capture the panel straight on so every declaration is legible.
                </p>
                <p className="text-2xs text-slate-600 font-mono">JPEG, PNG or WebP · Max 25 MB</p>
              </div>
            )}
          </div>
        </div>

        {/* Parameters */}
        <Panel className="lg:col-span-2">
          <div className="p-5 space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Inspection parameters</h2>
              <p className="text-2xs text-slate-500 mt-0.5">
                Determines which schedule applies to this package.
              </p>
            </div>

            <FormField
              label="Commodity category"
              htmlFor="commodity-select"
              required
              hint="Used to determine Second Schedule standard sizes and Unit Sale Price requirements."
            >
              <Select
                id="commodity-select"
                value={commodityType}
                onChange={(e) => setCommodityType(e.target.value)}
              >
                {COMMODITIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </Select>
            </FormField>

            <div className="rounded-md border border-slate-800 bg-gov-900 p-3.5">
              <p className="text-2xs font-medium uppercase tracking-wide text-slate-500">
                Verification pipeline
              </p>
              <ol className="mt-2.5 space-y-1.5 text-2xs text-slate-400">
                {[
                  'Image quality assessment',
                  'OCR text & bounding box extraction',
                  'Visual verification of marks',
                  'PCR 2011 & FSSR 2020 rule evaluation',
                ].map((step, i) => (
                  <li key={step} className="flex gap-2">
                    <span className="text-slate-600 tabular-nums">{i + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={handleUpload}
              disabled={!selectedFile}
              loading={uploading}
              iconRight={uploading ? undefined : ArrowRight}
            >
              {uploading ? 'Registering scan…' : 'Start compliance scan'}
            </Button>

            {uploading && (
              <p className="text-2xs text-slate-500 flex items-center justify-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
                Uploading image and assessing quality
              </p>
            )}
          </div>
        </Panel>
      </div>

      {/* Result */}
      {uploadResult && (
        <Panel className="animate-fade-in-up overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Scan registered</h3>
                <p className="text-2xs text-slate-500 font-mono mt-0.5">
                  {uploadResult.scan_number}
                </p>
              </div>
            </div>
            <Button
              variant="primary"
              iconRight={ArrowRight}
              onClick={() => onScanCreated(uploadResult.scan_id)}
            >
              Run analysis
            </Button>
          </div>

          <dl className="grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 divide-slate-800">
            <Field label="Resolution" mono className="p-4 sm:border-r border-slate-800">
              {quality?.width} × {quality?.height} px
            </Field>
            <Field label="Sharpness (Laplacian)" mono className="p-4 sm:border-r border-slate-800">
              <span className={quality?.is_blurry ? 'text-amber-400' : 'text-emerald-400'}>
                {quality?.laplacian_variance} · {quality?.is_blurry ? 'Blurry' : 'Crisp'}
              </span>
            </Field>
            <Field label="Contrast" mono className="p-4 sm:border-r border-slate-800">
              {quality?.contrast_score}
            </Field>
            <Field label="Integrity (SHA-256)" mono className="p-4">
              <span className="truncate block" title={uploadResult.sha256_hash}>
                {uploadResult.sha256_hash?.slice(0, 12)}…
              </span>
            </Field>
          </dl>

          {quality?.is_blurry && (
            <div className="px-5 pb-5">
              <Alert tone="warn" title="Image may be blurry">
                Extraction accuracy can suffer on soft images. You can still run the analysis, or
                retake the photograph in better light for a more reliable result.
              </Alert>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
};
