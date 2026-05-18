'use client';
import React, { useState } from 'react';
import { 
  Upload, 
  FileSpreadsheet, 
  X, 
  CheckCircle, 
  AlertCircle, 
  Loader2,
  Table
} from 'lucide-react';

interface CSVImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    projectId: string;
}

export const CSVImportModal = ({ isOpen, onClose, projectId }: CSVImportModalProps) => {
    const [step, setStep] = useState<'upload' | 'preview' | 'syncing' | 'complete'>('upload');
    const [fileName, setFileName] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setFileName(file.name);
            setStep('preview');
        }
    };

    const runSync = () => {
        setStep('syncing');
        setTimeout(() => setStep('complete'), 2500); // Simulated sync
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '24px'
        }}>
            <div style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: '24px',
                width: '100%',
                maxWidth: '600px',
                padding: '32px',
                boxShadow: 'var(--shadow-lg)',
                position: 'relative'
            }}>
                <button onClick={onClose} style={{ position: 'absolute', top: '24px', right: '24px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                    <X size={24} />
                </button>

                <h3 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '8px' }}>Manual Data Ingestion</h3>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '32px' }}>Upload CSV files for order reconciliation or inventory sync for {projectId}</p>

                {step === 'upload' && (
                    <div style={{
                        border: '2px dashed var(--border)',
                        borderRadius: '16px',
                        padding: '40px',
                        textAlign: 'center',
                        background: 'rgba(255,255,255,0.02)',
                        transition: 'border-color 0.2s'
                    }}>
                        <div style={{ width: '64px', height: '64px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', marginBottom: '16px', margin: '0 auto' }}>
                            <Upload color="var(--accent-blue)" />
                        </div>
                        <h4 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '8px' }}>Drop your CSV here</h4>
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '24px' }}>Max file size: 50MB. Required headers: order_id, amount, status</p>
                        
                        <label style={{ 
                            padding: '12px 24px', background: 'var(--accent-blue)', color: '#fff', 
                            borderRadius: '12px', fontWeight: '800', cursor: 'pointer', display: 'inline-block' 
                        }}>
                            Browse Files
                            <input type="file" accept=".csv" hidden onChange={handleFileUpload} />
                        </label>
                    </div>
                )}

                {step === 'preview' && (
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '12px', marginBottom: '24px' }}>
                            <FileSpreadsheet color="var(--accent-blue)" size={20} />
                            <span style={{ fontSize: '14px', fontWeight: '700' }}>{fileName}</span>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>(1,240 rows detected)</span>
                        </div>

                        <div style={{ marginBottom: '24px' }}>
                            <h5 style={{ fontSize: '12px', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '12px' }}>Schema Mapping Preview</h5>
                            <div style={{ background: 'var(--bg-app)', borderRadius: '12px', padding: '16px', border: '1px solid var(--border)' }}>
                                <table style={{ width: '100%', fontSize: '12px' }}>
                                    <tbody>
                                        <tr>
                                            <td style={{ color: 'var(--text-muted)', padding: '4px 0' }}>order_id</td>
                                            <td style={{ textAlign: 'right', fontWeight: '800' }}>→ external_id</td>
                                        </tr>
                                        <tr>
                                            <td style={{ color: 'var(--text-muted)', padding: '4px 0' }}>amount</td>
                                            <td style={{ textAlign: 'right', fontWeight: '800' }}>→ total_value</td>
                                        </tr>
                                        <tr>
                                            <td style={{ color: 'var(--text-muted)', padding: '4px 0' }}>status</td>
                                            <td style={{ textAlign: 'right', fontWeight: '800' }}>→ status</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button onClick={() => setStep('upload')} style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '12px', fontWeight: '800', cursor: 'pointer' }}>Cancel</button>
                            <button onClick={runSync} style={{ flex: 2, padding: '12px', background: 'var(--accent-blue)', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: '800', cursor: 'pointer' }}>Confirm & Start Sync</button>
                        </div>
                    </div>
                )}

                {step === 'syncing' && (
                    <div style={{ textAlign: 'center', padding: '40px 0' }}>
                        <Loader2 className="animate-spin" size={48} color="var(--accent-blue)" style={{ margin: '0 auto 24px' }} />
                        <h4 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '8px' }}>Processing Stream...</h4>
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Normalizing records and pushing to KPI aggregation engine</p>
                    </div>
                )}

                {step === 'complete' && (
                    <div style={{ textAlign: 'center', padding: '40px 0' }}>
                        <div style={{ width: '64px', height: '64px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                            <CheckCircle color="var(--accent-green)" size={32} />
                        </div>
                        <h4 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '8px' }}>Sync Success</h4>
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '32px' }}>1,238 records successfully ingested. 2 rows skipped (missing order_id).</p>
                        <button onClick={onClose} style={{ padding: '12px 32px', background: 'var(--accent-green)', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: '800', cursor: 'pointer' }}>Close</button>
                    </div>
                )}
            </div>
        </div>
    );
};
