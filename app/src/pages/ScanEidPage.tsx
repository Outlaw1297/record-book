import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { EidCapture } from '../eid/EidCapture';
import { rememberScannedEid } from '../eid/wand';
import { useToast } from '../ui/Toast';

export function ScanEidPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const returnTo = params.get('return') || '';
  const [eid, setEid] = useState('');

  function useOnAnimal(): void {
    if (!eid) return;
    rememberScannedEid(eid);
    if (returnTo.startsWith('/')) {
      navigate(returnTo);
      return;
    }
    navigate('/herd/new');
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Find by EID</h1>
        <p className="lede">
          Found a lost tag? Photo the yellow disc or scan with the wand to see
          which animal it belongs to on this ranch.
        </p>
      </header>

      <EidCapture
        variant="lookup"
        value={eid}
        onChange={setEid}
        onOpenAnimal={(animal) => {
          toast(`That’s ${animal.herdId}`);
          navigate(`/herd/${encodeURIComponent(animal.herdId)}`);
        }}
      />

      {returnTo.startsWith('/') && eid ? (
        <p style={{ marginTop: '1rem' }}>
          <button type="button" className="btn secondary" onClick={useOnAnimal}>
            Use this EID on the animal you were editing
          </button>
        </p>
      ) : null}

      <p style={{ marginTop: '1.25rem' }}>
        <Link to={returnTo.startsWith('/') ? returnTo : '/herd'}>Back</Link>
      </p>
    </div>
  );
}
