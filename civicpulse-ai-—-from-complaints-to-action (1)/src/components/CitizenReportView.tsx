import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  FileImage,
  MapPin,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react';
import React, { useState } from 'react';
import {
  Complaint,
  ComplaintCategory,
  SUPPORTED_CATEGORIES,
} from '../shared/types.ts';
import { LocationPinPickerMap } from './LeafletMapView.tsx';

interface CitizenReportViewProps {
  onSubmitted: (complaint: Complaint) => void;
  onNavigateTrack: (publicId: string) => void;
  onNavigateDetail: (publicId: string) => void;
}

const PRESET_LOCATIONS = [
  {
    name: 'Central Market Junction, Ward 4',
    lat: 12.9717,
    lng: 77.5945,
  },
  {
    name: 'Civic School Road, Ward 12',
    lat: 12.9853,
    lng: 77.6053,
  },
  {
    name: 'Tech Park Flyover, Sector 9',
    lat: 12.9353,
    lng: 77.6246,
  },
  {
    name: 'Lakeview Layout, Ward 7',
    lat: 12.9541,
    lng: 77.5721,
  },
];

export const CitizenReportView: React.FC<CitizenReportViewProps> = ({
  onSubmitted,
  onNavigateTrack,
  onNavigateDetail,
}) => {
  const [description, setDescription] = useState('');
  const [citizenCategory, setCitizenCategory] = useState<ComplaintCategory>('Road Damage');
  const [locationName, setLocationName] = useState('');
  const [includeCoordinates, setIncludeCoordinates] = useState(true);
  const [latitude, setLatitude] = useState<string>('12.9717');
  const [longitude, setLongitude] = useState<string>('77.5945');
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageFileName, setImageFileName] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submittedComplaint, setSubmittedComplaint] = useState<Complaint | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  const handleLoadDemoPreset = () => {
    setDescription(
      'Uncovered open manhole right outside Central Market Junction metro exit with no safety barricade; knee-deep waterlogging makes it invisible to commuters and school children.'
    );
    setCitizenCategory('Public Safety');
    setLocationName('Central Market Junction, Ward 4');
    setIncludeCoordinates(true);
    setLatitude('12.9716');
    setLongitude('77.5943');
    setErrorMessage(null);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setErrorMessage('Invalid file type. Please upload a JPEG, PNG, or WebP image.');
      e.target.value = '';
      return;
    }

    if (file.size > 3.5 * 1024 * 1024) {
      setErrorMessage('Image file exceeds maximum allowed size of 3.5 MB.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImageDataUrl(reader.result);
        setImageFileName(file.name);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setErrorMessage(null);

    if (description.trim().length < 8) {
      setErrorMessage('Please provide a clear complaint description (at least 8 characters).');
      return;
    }
    if (locationName.trim().length < 3) {
      setErrorMessage('Please specify the location or ward area name (at least 3 characters).');
      return;
    }

    let parsedLat: number | null = null;
    let parsedLng: number | null = null;
    if (includeCoordinates) {
      parsedLat = Number(latitude);
      parsedLng = Number(longitude);
      if (
        latitude.trim() === '' ||
        longitude.trim() === '' ||
        Number.isNaN(parsedLat) ||
        Number.isNaN(parsedLng) ||
        parsedLat < -90 ||
        parsedLat > 90 ||
        parsedLng < -180 ||
        parsedLng > 180
      ) {
        setErrorMessage(
          'Please enter valid latitude (-90 to 90) and longitude (-180 to 180), or uncheck "Include GPS Coordinates".'
        );
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: description.trim(),
          citizen_category: citizenCategory,
          location_name: locationName.trim(),
          latitude: includeCoordinates ? parsedLat : null,
          longitude: includeCoordinates ? parsedLng : null,
          image_data_url: imageDataUrl,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit complaint.');
      }

      setSubmittedComplaint(data.complaint);
      onSubmitted(data.complaint);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unable to submit complaint. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } catch {
      // Fallback
    }
  };

  if (submittedComplaint) {
    const c = submittedComplaint;
    return (
      <div className="max-w-3xl mx-auto py-8 px-4 sm:px-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-6">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-emerald-700 font-medium text-sm">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Citizen Report Logged & Analyzed</span>
              </div>
              <h1 className="text-2xl font-bold text-slate-900">
                Complaint Submitted Successfully
              </h1>
              <p className="text-sm text-slate-600">
                Save your public tracking ID below to monitor real-time status updates through resolution.
              </p>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-xs text-slate-500">Public Tracking Identifier</div>
              <div className="text-2xl font-bold font-mono-tabular text-slate-900 mt-0.5">
                {c.public_id}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Status: <strong className="text-slate-800">{c.status}</strong> · Priority:{' '}
                <strong className="text-slate-800">
                  {c.priority_level} ({c.priority_score.toFixed(2)} / 5.00)
                </strong>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleCopyId(c.public_id)}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-white border border-slate-300 rounded-lg text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copiedId ? 'Copied ID' : 'Copy Tracking ID'}</span>
            </button>
          </div>

          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <div className="text-xs text-slate-500">Assigned Category</div>
                <div className="font-medium text-slate-900 mt-0.5">
                  {c.category}{' '}
                  <span className="text-xs text-slate-500 font-normal">
                    ({Math.round(c.category_confidence * 100)}% confidence · {c.category_method})
                  </span>
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Location</div>
                <div className="font-medium text-slate-900 mt-0.5">
                  {c.location_name}
                  {c.latitude !== null && c.longitude !== null && (
                    <span className="text-xs font-mono-tabular text-slate-500 block">
                      {c.latitude.toFixed(4)}, {c.longitude.toFixed(4)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100">
              <div className="text-xs text-slate-500">
                Generated Officer Summary ({c.summary_method})
              </div>
              <p className="text-slate-800 mt-1">{c.summary}</p>
            </div>

            <div className="pt-3 border-t border-slate-100">
              <div className="text-xs text-slate-500">Explainable Priority Assessment</div>
              <p className="text-slate-800 mt-1 font-mono-tabular text-xs">
                {c.priority_breakdown.formula_display}
              </p>
              <p className="text-slate-600 text-xs mt-1">{c.priority_reason}</p>
            </div>

            {c.duplicate_candidates && c.duplicate_candidates.length > 0 && (
              <div className="pt-3 border-t border-slate-100">
                <div className="text-xs font-medium text-amber-800">
                  Possible Duplicate Reports Detected ({c.duplicate_candidates.length})
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  Your report was saved with its own tracking ID and linked as a candidate for consolidated field inspection alongside{' '}
                  <span className="font-mono-tabular font-medium text-slate-800">
                    {c.duplicate_candidates[0].candidate_public_id}
                  </span>{' '}
                  ({Math.round(c.duplicate_candidates[0].similarity_score * 100)}% similarity).
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => {
                setSubmittedComplaint(null);
                setDescription('');
                setImageDataUrl(null);
                setImageFileName('');
              }}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              Submit Another Report
            </button>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onNavigateDetail(c.public_id)}
                className="px-4 py-2 text-xs font-medium text-slate-800 border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
              >
                Inspect AI Triage Details
              </button>
              <button
                type="button"
                onClick={() => onNavigateTrack(c.public_id)}
                className="px-4 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors cursor-pointer"
              >
                Track My Complaint
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const parsedLatNum = includeCoordinates && latitude !== '' ? Number(latitude) : null;
  const parsedLngNum = includeCoordinates && longitude !== '' ? Number(longitude) : null;

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-medium text-teal-700">Stage 01 · Citizen Intake Pipeline</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
            Report a Civic Issue
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Anonymous reporting is enabled. Every report is automatically categorized, summarized, checked for nearby duplicates, and scored for priority.
          </p>
        </div>
        <button
          type="button"
          onClick={handleLoadDemoPreset}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Load 5-Min Demo Example</span>
        </button>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm flex items-start gap-3"
        >
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6"
        noValidate
      >
        <div className="space-y-2">
          <label
            htmlFor="report-description"
            className="block text-sm font-semibold text-slate-900"
          >
            Issue Description <span className="text-red-600">*</span>
          </label>
          <p className="text-xs text-slate-500">
            Describe what is damaged or disrupted, any safety risks (e.g., open manhole, live wire, blocked traffic), and how long it has persisted.
          </p>
          <textarea
            id="report-description"
            rows={4}
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Example: Deep pothole and knee-deep waterlogging outside Central Market Junction metro gate causing two-wheelers to swerve..."
            className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
          />
          <div className="flex justify-between text-xs text-slate-500 font-mono-tabular">
            <span>Minimum 8 characters required</span>
            <span>{description.length} / 3000</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label
              htmlFor="report-category"
              className="block text-sm font-semibold text-slate-900"
            >
              Citizen-Selected Category <span className="text-red-600">*</span>
            </label>
            <select
              id="report-category"
              value={citizenCategory}
              onChange={(e) => setCitizenCategory(e.target.value as ComplaintCategory)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
            >
              {SUPPORTED_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500">
              Retained alongside our automated text classifier for verification.
            </p>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="report-location"
              className="block text-sm font-semibold text-slate-900"
            >
              Location / Area Name <span className="text-red-600">*</span>
            </label>
            <input
              id="report-location"
              type="text"
              required
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              placeholder="e.g., Central Market Junction, Ward 4"
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
            />
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-xs text-slate-500">Quick select ward:</span>
              {PRESET_LOCATIONS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => {
                    setLocationName(preset.name);
                    setIncludeCoordinates(true);
                    setLatitude(String(preset.lat));
                    setLongitude(String(preset.lng));
                  }}
                  className="text-xs text-teal-700 hover:text-teal-900 underline cursor-pointer"
                >
                  {preset.name.split(',')[0]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3 pt-2 border-t border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="block text-sm font-semibold text-slate-900">
                Geographic Coordinates & Map Pin Selector
              </span>
              <span className="text-xs text-slate-500">
                Click anywhere on the map to place a pin, or uncheck if exact GPS coordinates are unknown.
              </span>
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={includeCoordinates}
                onChange={(e) => setIncludeCoordinates(e.target.checked)}
                className="rounded border-slate-300 text-teal-600 focus:ring-teal-600"
              />
              <span>Include GPS Coordinates</span>
            </label>
          </div>

          {includeCoordinates ? (
            <div className="space-y-3">
              <LocationPinPickerMap
                latitude={parsedLatNum}
                longitude={parsedLngNum}
                onSelectCoordinates={(lat, lng) => {
                  setLatitude(String(lat));
                  setLongitude(String(lng));
                }}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="report-lat" className="block text-xs text-slate-600 mb-1">
                    Latitude (-90 to 90)
                  </label>
                  <input
                    id="report-lat"
                    type="number"
                    step="any"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono-tabular text-slate-900"
                  />
                </div>
                <div>
                  <label htmlFor="report-lng" className="block text-xs text-slate-600 mb-1">
                    Longitude (-180 to 180)
                  </label>
                  <input
                    id="report-lng"
                    type="number"
                    step="any"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono-tabular text-slate-900"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
              <span>
                Submitting without GPS coordinates. The complaint will still be triaged by text and ward name, and flagged as missing exact coordinates in the priority breakdown.
              </span>
            </div>
          )}
        </div>

        <div className="space-y-2 pt-2 border-t border-slate-100">
          <label className="block text-sm font-semibold text-slate-900">
            Field Evidence Photo (Optional)
          </label>
          <p className="text-xs text-slate-500">
            Accepts JPEG, PNG, or WebP up to 3.5 MB. Stored safely for officer visual inspection (automated computer-vision image recognition is not enabled in this prototype).
          </p>

          {!imageDataUrl ? (
            <label className="flex items-center justify-center gap-2 w-full py-4 px-4 border border-dashed border-slate-300 rounded-lg text-xs text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors">
              <FileImage className="w-4 h-4 text-slate-500" />
              <span>Select photo evidence (JPEG, PNG, WebP)</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleImageChange}
                className="hidden"
              />
            </label>
          ) : (
            <div className="flex items-center justify-between gap-4 p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="flex items-center gap-3">
                <img
                  src={imageDataUrl}
                  alt="Uploaded complaint evidence preview"
                  referrerPolicy="no-referrer"
                  className="w-14 h-14 object-cover rounded border border-slate-200"
                />
                <div className="text-xs">
                  <div className="font-medium text-slate-900">{imageFileName || 'Attached photo'}</div>
                  <div className="text-slate-500">Validated image attachment</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setImageDataUrl(null);
                  setImageFileName('');
                }}
                className="inline-flex items-center gap-1 text-xs text-red-700 hover:text-red-900 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove</span>
              </button>
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-xs text-slate-500">
            No personal identity or phone number is required.
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Send className="w-4 h-4" />
            <span>{isSubmitting ? 'Analyzing & Saving Report...' : 'Submit Civic Report'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
