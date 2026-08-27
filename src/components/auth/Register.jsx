// src/components/auth/Register.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { 
  Eye, EyeOff, Zap, ArrowRight, Shield, Users, 
  CheckCircle, AlertCircle, CheckCircle2, Loader2 
} from 'lucide-react';
import toast from 'react-hot-toast';
import { sendVerificationEmail, generateToken } from '../../services/emailService';
import teamService from '../../services/teamService';

const ROLE_OPTIONS = [
  {
    value: 'manager',
    label: 'Supervisor',
    icon: Shield,
    description: 'Oversee multiple projects and teams'
  },
  {
    value: 'member',
    label: 'Team Lead',
    icon: Users,
    description: 'Manage projects and team members'
  }
];

const STRENGTH_MAP = {
  0: { label: 'Very Weak', color: '#ef4444', feedback: 'Add more characters and variety' },
  1: { label: 'Weak', color: '#f59e0b', feedback: 'Mix uppercase, lowercase, numbers, and symbols' },
  2: { label: 'Fair', color: '#f59e0b', feedback: 'Add numbers and special characters' },
  3: { label: 'Good', color: '#10b981', feedback: 'Almost there, add special characters' },
  4: { label: 'Strong', color: '#10b981', feedback: 'Great password!' },
  5: { label: 'Very Strong', color: '#10b981', feedback: 'Excellent password security!' }
};

const REQUIREMENTS = [
  { test: (p) => p.length >= 8, label: 'Min 8 characters' },
  { test: (p) => /[a-z]/.test(p) && /[A-Z]/.test(p), label: 'Uppercase & lowercase' },
  { test: (p) => /\d/.test(p), label: 'Number' },
  { test: (p) => /[^a-zA-Z0-9]/.test(p), label: 'Special character' }
];

function scorePassword(password) {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  return Math.min(score, 5);
}

// Validation functions
const validators = {
  username: (value) => {
    if (!value || value.trim() === '') {
      return { valid: false, message: 'Username is required' };
    }
    if (value.length < 3) {
      return { valid: false, message: 'Username must be at least 3 characters' };
    }
    if (value.length > 50) {
      return { valid: false, message: 'Username must be less than 50 characters' };
    }
    if (!/^[a-zA-Z0-9_]+$/.test(value)) {
      return { valid: false, message: 'Username can only contain letters, numbers, and underscores' };
    }
    return { valid: true, message: '' };
  },
  
  email: (value) => {
    if (!value || value.trim() === '') {
      return { valid: false, message: 'Email is required' };
    }
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(value.trim())) {
      return { valid: false, message: 'Please enter a valid email address (e.g., user@domain.com)' };
    }
    if (value.length > 254) {
      return { valid: false, message: 'Email address is too long (maximum 254 characters)' };
    }
    return { valid: true, message: '' };
  },
  
  password: (value) => {
    if (!value || value === '') {
      return { valid: false, message: 'Password is required' };
    }
    if (value.length < 8) {
      return { valid: false, message: 'Password must be at least 8 characters long' };
    }
    if (value.length > 128) {
      return { valid: false, message: 'Password is too long (maximum 128 characters)' };
    }
    if (!/[A-Z]/.test(value)) {
      return { valid: false, message: 'Password must contain at least one uppercase letter' };
    }
    if (!/[a-z]/.test(value)) {
      return { valid: false, message: 'Password must contain at least one lowercase letter' };
    }
    if (!/[0-9]/.test(value)) {
      return { valid: false, message: 'Password must contain at least one number' };
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(value)) {
      return { valid: false, message: 'Password must contain at least one special character (!@#$%^&*(),.?":{}|<>)' };
    }
    return { valid: true, message: '' };
  },
  
  confirmPassword: (value, password) => {
    if (!value || value === '') {
      return { valid: false, message: 'Please confirm your password' };
    }
    if (value !== password) {
      return { valid: false, message: 'Passwords do not match' };
    }
    return { valid: true, message: '' };
  },
  
  role: (value) => {
    if (!value) {
      return { valid: false, message: 'Please select a role' };
    }
    if (!['manager', 'member'].includes(value)) {
      return { valid: false, message: 'Invalid role selected' };
    }
    return { valid: true, message: '' };
  }
};

// Helper function to safely extract error message
const getErrorMessage = (errorData) => {
  if (!errorData) return null;
  
  // If it's already a string
  if (typeof errorData === 'string') return errorData;
  
  // If it's an array, take the first element
  if (Array.isArray(errorData) && errorData.length > 0) {
    return typeof errorData[0] === 'string' ? errorData[0] : String(errorData[0]);
  }
  
  // If it's an object, try to get a message
  if (typeof errorData === 'object') {
    if (errorData.message) return typeof errorData.message === 'string' ? errorData.message : String(errorData.message);
    if (errorData.detail) return typeof errorData.detail === 'string' ? errorData.detail : String(errorData.detail);
    if (errorData.error) return typeof errorData.error === 'string' ? errorData.error : String(errorData.error);
  }
  
  // Fallback
  return String(errorData) || null;
};

export default function Register() {
  const [formData, setFormData] = useState({
    u_name: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'member'
  });
  const [showPass, setShowPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [touched, setTouched] = useState({
    u_name: false,
    email: false,
    password: false,
    confirmPassword: false,
    role: false
  });
  const [validationErrors, setValidationErrors] = useState({
    u_name: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: ''
  });
  
  const { register } = useAuth();
  const navigate = useNavigate();

  const strengthScore = scorePassword(formData.password);
  const strength = STRENGTH_MAP[strengthScore];

  // Validate field
  const validateField = (field, value) => {
    let result;
    switch (field) {
      case 'u_name':
        result = validators.username(value);
        break;
      case 'email':
        result = validators.email(value);
        break;
      case 'password':
        result = validators.password(value);
        break;
      case 'confirmPassword':
        result = validators.confirmPassword(value, formData.password);
        break;
      case 'role':
        result = validators.role(value);
        break;
      default:
        result = { valid: true, message: '' };
    }
    setValidationErrors(prev => ({ ...prev, [field]: result.valid ? '' : result.message }));
    return result.valid;
  };

  // Handle field change with validation
  const handleFieldChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (touched[field]) {
      validateField(field, value);
      if (field === 'password' && touched.confirmPassword) {
        validateField('confirmPassword', formData.confirmPassword);
      }
    }
  };

  // Handle field blur
  const handleBlur = (field) => {
    setTouched(prev => ({ ...prev, [field]: true }));
    const value = formData[field];
    validateField(field, value);
    if (field === 'password' && formData.confirmPassword) {
      validateField('confirmPassword', formData.confirmPassword);
    }
  };

  // Handle role selection
  const handleRoleSelect = (role) => {
    setFormData(prev => ({ ...prev, role }));
    setTouched(prev => ({ ...prev, role: true }));
    validateField('role', role);
  };

  // Validate all fields before submit
  const validateForm = () => {
    const fields = ['u_name', 'email', 'password', 'confirmPassword', 'role'];
    let allValid = true;
    
    fields.forEach(field => {
      setTouched(prev => ({ ...prev, [field]: true }));
      const value = formData[field];
      const isValid = validateField(field, value);
      if (!isValid) allValid = false;
    });
    
    return allValid;
  };

  // Get field status for styling
  const getFieldStatus = (field) => {
    if (!touched[field]) return 'idle';
    const error = validationErrors[field];
    if (error) return 'error';
    return 'success';
  };

  // Check if form is valid
  const isFormValid = () => {
    return Object.values(validationErrors).every(e => e === '') &&
           Object.values(formData).every(v => v !== '' || v === 'member');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error('Please fix all errors before submitting');
      return;
    }

    setLoading(true);
    try {
      const registrationData = {
        u_name: formData.u_name.trim(),
        email: formData.email.trim(),
        password: formData.password,
        role: formData.role
      };

      console.log('📤 Registration data:', registrationData);

      // 1. Register the user
      const user = await register(registrationData);
      console.log('✅ User registered:', user);
      
      // 2. Create a Team Member entry for this user
      try {
        const teamMemberData = {
          name: formData.u_name.trim(),
          role: formData.role === 'manager' ? 'Supervisor' : 'Team Lead',
          email: formData.email.trim(),
          qualification: 'New Member',
          experience: 0,
          skills: 'New User',
          description: `Auto-created team member for ${formData.u_name}`,
          added_by: user?.id || 1
        };
        
        const teamMember = await teamService.addTeamMember(teamMemberData);
        console.log('✅ Team Member created:', teamMember);
      } catch (teamError) {
        console.error('❌ Error creating team member:', teamError);
        toast.warning('Account created but team member profile could not be created.');
      }
      
      // 3. Send verification email
      setSendingEmail(true);
      const verificationToken = generateToken(formData.email);
      const verificationLink = `${window.location.origin}/verify-email?token=${verificationToken}`;
      
      console.log('🔗 Verification link:', verificationLink);
      
      const emailResult = await sendVerificationEmail(
        formData.email,
        formData.u_name,
        verificationLink
      );

      console.log('📧 Email result:', emailResult);

      if (emailResult.success) {
        toast.success('Registration successful! Check your email for verification link.');
        navigate('/verify-email', { 
          state: { 
            email: formData.email,
            name: formData.u_name
          }
        });
      } else {
        toast.warning('Account created but verification email could not be sent.');
        navigate('/login', { 
          state: { 
            email: formData.email,
            warning: 'Please contact support to verify your email.'
          }
        });
      }
      
    } catch (err) {
      console.error('🔴 Registration error:', err);
      
      // Extract error data
      const errorData = err?.response?.data;
      console.log('📋 Error data:', errorData);
      
      // Reset validation errors
      setValidationErrors({
        u_name: '',
        email: '',
        password: '',
        confirmPassword: '',
        role: ''
      });
      
      let emailError = null;
      let usernameError = null;
      let passwordError = null;
      let roleError = null;
      let generalError = null;
      
      if (errorData) {
        // Check for error in errorData.error
        if (errorData.error) {
          const errorMsg = getErrorMessage(errorData.error);
          if (errorMsg) {
            // Try to determine which field it belongs to
            const lowerMsg = errorMsg.toLowerCase();
            if (lowerMsg.includes('email') || lowerMsg.includes('exists') || lowerMsg.includes('already') || lowerMsg.includes('duplicate')) {
              emailError = errorMsg;
            } else if (lowerMsg.includes('username') || lowerMsg.includes('u_name')) {
              usernameError = errorMsg;
            } else if (lowerMsg.includes('password')) {
              passwordError = errorMsg;
            } else if (lowerMsg.includes('role')) {
              roleError = errorMsg;
            } else {
              generalError = errorMsg;
            }
          }
        }
        
        // Check specific fields
        if (errorData.email) {
          emailError = getErrorMessage(errorData.email) || 'Email is invalid';
        }
        
        if (errorData.u_name) {
          usernameError = getErrorMessage(errorData.u_name) || 'Username is invalid';
        }
        
        if (errorData.password) {
          passwordError = getErrorMessage(errorData.password) || 'Password is invalid';
        }
        
        if (errorData.role) {
          roleError = getErrorMessage(errorData.role) || 'Role is invalid';
        }
        
        // Check non_field_errors
        if (errorData.non_field_errors) {
          const msg = getErrorMessage(errorData.non_field_errors);
          if (msg) {
            const lowerMsg = msg.toLowerCase();
            if (lowerMsg.includes('email') || lowerMsg.includes('exists') || lowerMsg.includes('already')) {
              emailError = msg;
            } else {
              generalError = msg;
            }
          }
        }
        
        // Check message/detail fields
        if (errorData.message) {
          const msg = getErrorMessage(errorData.message);
          if (msg) {
            const lowerMsg = msg.toLowerCase();
            if (lowerMsg.includes('email') || lowerMsg.includes('exists') || lowerMsg.includes('already')) {
              emailError = msg;
            } else {
              generalError = msg;
            }
          }
        }
        
        if (errorData.detail) {
          const msg = getErrorMessage(errorData.detail);
          if (msg) {
            const lowerMsg = msg.toLowerCase();
            if (lowerMsg.includes('email') || lowerMsg.includes('exists') || lowerMsg.includes('already')) {
              emailError = msg;
            } else {
              generalError = msg;
            }
          }
        }
      }
      
      // ✅ Set errors on the appropriate fields
      if (emailError) {
        setValidationErrors(prev => ({ ...prev, email: emailError }));
        setTouched(prev => ({ ...prev, email: true }));
        toast.error(emailError);
      } else if (usernameError) {
        setValidationErrors(prev => ({ ...prev, u_name: usernameError }));
        setTouched(prev => ({ ...prev, u_name: true }));
        toast.error(usernameError);
      } else if (passwordError) {
        setValidationErrors(prev => ({ ...prev, password: passwordError }));
        setTouched(prev => ({ ...prev, password: true }));
        toast.error(passwordError);
      } else if (roleError) {
        setValidationErrors(prev => ({ ...prev, role: roleError }));
        setTouched(prev => ({ ...prev, role: true }));
        toast.error(roleError);
      } else if (generalError) {
        toast.error(generalError);
      } else {
        toast.error('Registration failed. Please try again.');
      }
      
      // ✅ Keep user on registration page
      return;
      
    } finally {
      setLoading(false);
      setSendingEmail(false);
    }
  };

  return (
    <div className="register-screen">
      {/* Background effects */}
      <div className="bg-fx" aria-hidden="true">
        <div className="bg-orb bg-orb--a" />
        <div className="bg-orb bg-orb--b" />
        <div className="bg-orb bg-orb--c" />
        <svg className="bg-grid" width="100%" height="100%">
          <defs>
            <pattern id="regGridPattern" width="42" height="42" patternUnits="userSpaceOnUse">
              <path d="M 42 0 L 0 0 0 42" fill="none" stroke="var(--border-subtle)" strokeWidth="1" />
            </pattern>
            <radialGradient id="regGridFade" cx="30%" cy="35%" r="75%">
              <stop offset="0%" stopColor="white" stopOpacity="0.9" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </radialGradient>
            <mask id="regGridMask">
              <rect width="100%" height="100%" fill="url(#regGridFade)" />
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="url(#regGridPattern)" mask="url(#regGridMask)" />
        </svg>
      </div>

      <div className="register-panel">
        <div className="register-card animate-fade-in">
          <div className="brand">
            <div className="brand-mark">
              <Zap size={20} color="white" fill="white" />
            </div>
            <span className="brand-name">AEEL-PMS</span>
          </div>

          <h1 className="headline">
            Create your <span className="gradient-text">account</span>
          </h1>
          <p className="subhead">Choose your role and get started with AEEL-PMS.</p>

          <form onSubmit={handleSubmit} className="form" noValidate>
            {/* Username Field */}
            <div className="input-group">
              <label htmlFor="u_name">
                Username <span className="required-star">*</span>
              </label>
              <div className="field-wrapper">
                <input
                  id="u_name"
                  className={`input ${getFieldStatus('u_name') !== 'idle' ? `input-${getFieldStatus('u_name')}` : ''}`}
                  type="text"
                  name="u_name"
                  placeholder="johndoe"
                  value={formData.u_name}
                  onChange={e => handleFieldChange('u_name', e.target.value)}
                  onBlur={() => handleBlur('u_name')}
                  disabled={loading || sendingEmail}
                  autoFocus
                  aria-invalid={!!validationErrors.u_name}
                  aria-describedby="u_name-error"
                />
                {touched.u_name && validationErrors.u_name && (
                  <div className="field-icon error-icon">
                    <AlertCircle size={16} color="#f87171" />
                  </div>
                )}
                {touched.u_name && !validationErrors.u_name && formData.u_name && (
                  <div className="field-icon success-icon">
                    <CheckCircle2 size={16} color="#34d399" />
                  </div>
                )}
              </div>
              {touched.u_name && validationErrors.u_name && (
                <div className="error-message" id="u_name-error">
                  <AlertCircle size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                  {validationErrors.u_name}
                </div>
              )}
            </div>

            {/* Email Field */}
            <div className="input-group">
              <label htmlFor="email">
                Email address <span className="required-star">*</span>
              </label>
              <div className="field-wrapper">
                <input
                  id="email"
                  className={`input ${getFieldStatus('email') !== 'idle' ? `input-${getFieldStatus('email')}` : ''}`}
                  type="email"
                  name="email"
                  placeholder="your@email.com"
                  value={formData.email}
                  onChange={e => handleFieldChange('email', e.target.value)}
                  onBlur={() => handleBlur('email')}
                  disabled={loading || sendingEmail}
                  aria-invalid={!!validationErrors.email}
                  aria-describedby="email-error"
                />
                {touched.email && validationErrors.email && (
                  <div className="field-icon error-icon">
                    <AlertCircle size={16} color="#f87171" />
                  </div>
                )}
                {touched.email && !validationErrors.email && formData.email && (
                  <div className="field-icon success-icon">
                    <CheckCircle2 size={16} color="#34d399" />
                  </div>
                )}
              </div>
              {touched.email && validationErrors.email && (
                <div className="error-message error-email" id="email-error">
                  <AlertCircle size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                  {validationErrors.email}
                </div>
              )}
            </div>

            {/* Role Selection */}
            <div className="input-group">
              <label>
                Select your role <span className="required-star">*</span>
              </label>
              <div className="role-grid">
                {ROLE_OPTIONS.map((role) => {
                  const Icon = role.icon;
                  const isSelected = formData.role === role.value;
                  
                  return (
                    <button
                      key={role.value}
                      type="button"
                      className={`role-card ${isSelected ? 'role-card--active' : ''}`}
                      onClick={() => handleRoleSelect(role.value)}
                      disabled={loading || sendingEmail}
                      aria-selected={isSelected}
                    >
                      <Icon size={20} className="role-icon" />
                      <div className="role-label">{role.label}</div>
                      <div className="role-desc">{role.description}</div>
                      {isSelected && (
                        <div className="role-checkmark">
                          <CheckCircle size={16} color="#6366f1" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              {touched.role && validationErrors.role && (
                <div className="error-message">
                  <AlertCircle size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                  {validationErrors.role}
                </div>
              )}
            </div>

            {/* Password Field */}
            <div className="input-group">
              <label htmlFor="password">
                Password <span className="required-star">*</span>
              </label>
              <div className="field-wrapper">
                <div className="password-field">
                  <input
                    id="password"
                    className={`input ${getFieldStatus('password') !== 'idle' ? `input-${getFieldStatus('password')}` : ''}`}
                    type={showPass ? 'text' : 'password'}
                    name="password"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={e => handleFieldChange('password', e.target.value)}
                    onBlur={() => handleBlur('password')}
                    disabled={loading || sendingEmail}
                    aria-invalid={!!validationErrors.password}
                    aria-describedby="password-error"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPass(!showPass)}
                    aria-label={showPass ? 'Hide password' : 'Show password'}
                    disabled={loading || sendingEmail}
                  >
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                  {touched.password && validationErrors.password && (
                    <div className="field-icon error-icon password-icon">
                      <AlertCircle size={16} color="#f87171" />
                    </div>
                  )}
                  {touched.password && !validationErrors.password && formData.password && (
                    <div className="field-icon success-icon password-icon">
                      <CheckCircle2 size={16} color="#34d399" />
                    </div>
                  )}
                </div>
              </div>
              {touched.password && validationErrors.password && (
                <div className="error-message" id="password-error">
                  <AlertCircle size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                  {validationErrors.password}
                </div>
              )}

              {formData.password && (
                <div className="strength">
                  <div className="strength-bars">
                    {[1, 2, 3, 4, 5].map((level) => (
                      <div
                        key={level}
                        className="strength-bar"
                        style={{ background: level <= strengthScore ? strength.color : 'var(--border-subtle)' }}
                      />
                    ))}
                    <span className="strength-label" style={{ color: strength.color }}>{strength.label}</span>
                  </div>
                  <span className="strength-feedback">{strength.feedback}</span>
                </div>
              )}

              <div className="requirements">
                {REQUIREMENTS.map(({ test, label }) => {
                  const isMet = test(formData.password);
                  return (
                    <div className={`requirement ${isMet ? 'requirement--met' : ''}`} key={label}>
                      <CheckCircle size={12} color={isMet ? '#10b981' : 'var(--text-muted)'} />
                      <span>{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Confirm Password Field */}
            <div className="input-group">
              <label htmlFor="confirmPassword">
                Confirm Password <span className="required-star">*</span>
              </label>
              <div className="field-wrapper">
                <div className="password-field">
                  <input
                    id="confirmPassword"
                    className={`input ${getFieldStatus('confirmPassword') !== 'idle' ? `input-${getFieldStatus('confirmPassword')}` : ''}`}
                    type={showConfirmPass ? 'text' : 'password'}
                    name="confirmPassword"
                    placeholder="••••••••"
                    value={formData.confirmPassword}
                    onChange={e => handleFieldChange('confirmPassword', e.target.value)}
                    onBlur={() => handleBlur('confirmPassword')}
                    disabled={loading || sendingEmail}
                    aria-invalid={!!validationErrors.confirmPassword}
                    aria-describedby="confirmPassword-error"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowConfirmPass(!showConfirmPass)}
                    aria-label={showConfirmPass ? 'Hide password' : 'Show password'}
                    disabled={loading || sendingEmail}
                  >
                    {showConfirmPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                  {touched.confirmPassword && validationErrors.confirmPassword && (
                    <div className="field-icon error-icon password-icon">
                      <AlertCircle size={16} color="#f87171" />
                    </div>
                  )}
                  {touched.confirmPassword && !validationErrors.confirmPassword && formData.confirmPassword && (
                    <div className="field-icon success-icon password-icon">
                      <CheckCircle2 size={16} color="#34d399" />
                    </div>
                  )}
                </div>
              </div>
              {touched.confirmPassword && validationErrors.confirmPassword && (
                <div className="error-message" id="confirmPassword-error">
                  <AlertCircle size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                  {validationErrors.confirmPassword}
                </div>
              )}
            </div>

            <button 
              type="submit" 
              className="btn btn-primary submit-btn" 
              disabled={loading || sendingEmail || !isFormValid()}
            >
              {loading ? (
                <>
                  <span className="spinner" />
                  Creating account...
                </>
              ) : sendingEmail ? (
                <>
                  <Loader2 size={17} className="spin" />
                  Sending verification email...
                </>
              ) : (
                <>Create Account <ArrowRight size={17} /></>
              )}
            </button>
          </form>

          <p className="signin-line">
            Already have an account?{' '}
            <button type="button" className="signin-link" onClick={() => navigate('/login')}>
              Sign in
            </button>
          </p>
        </div>
      </div>

      <div className="side-panel">
        <div className="side-content animate-slide-right stagger-children">
          <h2 className="side-title">Choose your role</h2>

          {ROLE_OPTIONS.map((role) => {
            const Icon = role.icon;
            const isSelected = formData.role === role.value;
            return (
              <div key={role.value} className={`side-role ${isSelected ? 'side-role--active' : ''}`}>
                <div className="side-role-icon">
                  <Icon size={18} />
                </div>
                <div>
                  <p className="side-role-label">{role.label}</p>
                  <p className="side-role-desc">{role.description}</p>
                </div>
              </div>
            );
          })}

          <div className="stats-card">
            <div className="stat">
              <p className="stat-num" style={{ color: 'var(--accent-primary)' }}>100+</p>
              <p className="stat-label">Active Projects</p>
            </div>
            <div className="stat-divider" />
            <div className="stat">
              <p className="stat-num" style={{ color: 'var(--accent-teal)' }}>50+</p>
              <p className="stat-label">Team Members</p>
            </div>
            <div className="stat-divider" />
            <div className="stat">
              <p className="stat-num" style={{ color: 'var(--accent-amber)' }}>95%</p>
              <p className="stat-label">Satisfaction</p>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        * { box-sizing: border-box; }

        .register-screen {
          min-height: 100vh;
          display: flex;
          background: var(--bg-primary);
          position: relative;
          overflow: hidden;
        }

        .bg-fx {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
          z-index: 0;
        }

        .bg-grid {
          position: absolute;
          inset: 0;
          opacity: 0.5;
        }

        .bg-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(70px);
          opacity: 0.32;
          will-change: transform;
        }

        .bg-orb--a {
          width: 480px;
          height: 480px;
          top: -140px;
          left: -100px;
          background: radial-gradient(circle, var(--accent-primary), transparent 70%);
          animation: drift1 22s ease-in-out infinite;
        }

        .bg-orb--b {
          width: 420px;
          height: 420px;
          bottom: -160px;
          left: 30%;
          background: radial-gradient(circle, var(--accent-teal), transparent 70%);
          animation: drift2 26s ease-in-out infinite;
        }

        .bg-orb--c {
          width: 360px;
          height: 360px;
          top: 20%;
          right: -80px;
          background: radial-gradient(circle, var(--accent-secondary), transparent 70%);
          animation: drift3 30s ease-in-out infinite;
        }

        @keyframes drift1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(60px, 40px) scale(1.08); }
        }
        @keyframes drift2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-50px, -30px) scale(1.1); }
        }
        @keyframes drift3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-40px, 50px) scale(0.95); }
        }

        .register-panel {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: clamp(24px, 4vh, 44px) clamp(24px, 5vw, 64px);
          position: relative;
          z-index: 1;
        }

        .register-card {
          width: 100%;
          max-width: 440px;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 20px;
        }

        .brand-mark {
          width: 36px;
          height: 36px;
          background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 16px var(--accent-glow);
          flex-shrink: 0;
        }

        .brand-name {
          font-family: var(--font-display);
          font-size: 19px;
          font-weight: 800;
          letter-spacing: -0.3px;
        }

        .headline {
          font-size: clamp(24px, 3vw, 28px);
          font-weight: 800;
          line-height: 1.15;
          letter-spacing: -0.6px;
          margin: 0 0 6px;
        }

        .gradient-text {
          background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .subhead {
          color: var(--text-secondary);
          font-size: 14px;
          margin: 0 0 20px;
        }

        .form {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .input-group label {
          display: block;
          font-size: 12.5px;
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: 5px;
        }

        .required-star {
          color: #f87171;
          margin-left: 2px;
        }

        .field-wrapper {
          position: relative;
        }

        .field-icon {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          pointer-events: none;
        }

        .error-icon {
          color: #f87171;
        }

        .success-icon {
          color: #34d399;
        }

        .password-field .password-icon {
          right: 40px;
        }

        .input {
          width: 100%;
          padding: 10px 14px;
          border: 2px solid var(--border-default);
          border-radius: 10px;
          background: var(--bg-secondary);
          color: var(--text-primary);
          font-size: 14px;
          transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
          outline: none;
        }

        .input:focus {
          border-color: var(--accent-primary);
          background: var(--bg-card);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08);
        }

        .input::placeholder {
          color: var(--text-muted);
        }

        .input:disabled {
          opacity: 0.6;
        }

        .input-error {
          border-color: #f87171 !important;
          background: rgba(248, 113, 113, 0.04) !important;
        }

        .input-error:focus {
          box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.12) !important;
        }

        .input-success {
          border-color: #34d399 !important;
          background: rgba(52, 211, 153, 0.04) !important;
        }

        .input-success:focus {
          box-shadow: 0 0 0 3px rgba(52, 211, 153, 0.12) !important;
        }

        .error-message {
          color: #f87171;
          font-size: 12px;
          font-weight: 500;
          margin-top: 4px;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .error-email {
          color: #dc2626;
          font-weight: 600;
          background: rgba(220, 38, 38, 0.08);
          padding: 6px 10px;
          border-radius: 6px;
          border-left: 3px solid #dc2626;
        }

        .role-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 4px;
        }

        .role-card {
          position: relative;
          padding: 12px 10px;
          border-radius: 12px;
          border: 2px solid var(--border-default);
          background: var(--bg-secondary);
          cursor: pointer;
          transition: border-color 0.2s, background 0.2s, transform 0.15s;
          text-align: center;
          color: var(--text-primary);
        }
        .role-card:hover {
          transform: translateY(-2px);
        }
        .role-card--active {
          border-color: var(--accent-primary);
          background: rgba(99,102,241,0.08);
        }

        .role-icon {
          display: block;
          margin: 0 auto 5px;
          color: var(--text-muted);
        }
        .role-card--active .role-icon {
          color: var(--accent-primary);
        }

        .role-label {
          font-size: 13px;
          font-weight: 500;
          margin-bottom: 3px;
        }
        .role-card--active .role-label {
          font-weight: 700;
          color: var(--accent-primary);
        }

        .role-desc {
          font-size: 10.5px;
          color: var(--text-muted);
          line-height: 1.3;
        }

        .role-checkmark {
          position: absolute;
          top: 6px;
          right: 6px;
        }

        .password-field {
          position: relative;
        }
        .password-field .input {
          padding-right: 42px;
        }
        .password-toggle {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 4px;
          display: flex;
          transition: color 0.2s;
        }
        .password-toggle:hover {
          color: var(--text-primary);
        }

        .strength {
          margin-top: 6px;
        }
        .strength-bars {
          display: flex;
          align-items: center;
          gap: 4px;
          margin-bottom: 2px;
        }
        .strength-bar {
          height: 3px;
          flex: 1;
          border-radius: 2px;
          transition: background 0.3s;
        }
        .strength-label {
          font-size: 10.5px;
          font-weight: 600;
          white-space: nowrap;
          margin-left: 4px;
        }
        .strength-feedback {
          font-size: 10.5px;
          color: var(--text-muted);
        }

        .requirements {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4px;
          margin-top: 6px;
        }
        .requirement {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          color: var(--text-muted);
          transition: color 0.3s;
        }
        .requirement--met {
          color: #10b981;
        }

        .btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 10px 18px;
          border: none;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-primary {
          background: var(--accent-primary);
          color: #fff;
        }

        .btn-primary:hover:not(:disabled) {
          opacity: 0.85;
          transform: translateY(-1px);
        }

        .btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }

        .submit-btn {
          margin-top: 2px;
          justify-content: center;
          padding: 12px 20px;
          font-size: 15px;
          gap: 8px;
        }

        .spinner {
          width: 15px;
          height: 15px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        .signin-line {
          margin-top: 16px;
          text-align: center;
          font-size: 13.5px;
          color: var(--text-secondary);
        }
        .signin-link {
          background: none;
          border: none;
          color: var(--accent-primary);
          font-weight: 600;
          cursor: pointer;
          padding: 0;
          font-size: 13.5px;
          transition: color 0.2s;
        }
        .signin-link:hover {
          color: var(--accent-secondary);
        }

        .side-panel {
          width: 380px;
          background: var(--bg-secondary);
          border-left: 1px solid var(--border-subtle);
          display: flex;
          align-items: center;
          padding: clamp(24px, 4vh, 44px) 32px;
          flex-shrink: 0;
          position: relative;
          z-index: 1;
        }

        @media (max-width: 900px) {
          .side-panel { display: none; }
        }

        .side-content {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .side-title {
          font-family: var(--font-display);
          font-size: 18px;
          font-weight: 700;
          margin: 0 0 2px;
        }

        .side-role {
          display: flex;
          gap: 12px;
          padding: 14px;
          background: var(--bg-card);
          border-radius: 12px;
          border: 2px solid var(--border-subtle);
          opacity: 0.7;
          transition: all 0.3s;
        }
        .side-role--active {
          border-color: var(--accent-primary);
          opacity: 1;
        }

        .side-role-icon {
          width: 36px;
          height: 36px;
          background: var(--bg-secondary);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          color: var(--text-muted);
          transition: all 0.3s;
        }
        .side-role--active .side-role-icon {
          background: rgba(99,102,241,0.15);
          color: var(--accent-primary);
        }

        .side-role-label {
          font-weight: 600;
          margin: 0 0 2px;
          font-family: var(--font-display);
          font-size: 13.5px;
          color: var(--text-primary);
        }
        .side-role--active .side-role-label {
          color: var(--accent-primary);
        }

        .side-role-desc {
          font-size: 11.5px;
          color: var(--text-secondary);
          line-height: 1.4;
          margin: 0;
        }

        .stats-card {
          margin-top: 2px;
          padding: 14px 12px;
          background: var(--bg-card);
          border-radius: 12px;
          border: 1px solid var(--border-subtle);
          display: flex;
          align-items: center;
          justify-content: space-around;
        }
        .stat {
          text-align: center;
        }
        .stat-num {
          font-size: 17px;
          font-weight: 800;
          margin: 0;
        }
        .stat-label {
          font-size: 9.5px;
          color: var(--text-muted);
          margin: 0;
        }
        .stat-divider {
          width: 1px;
          height: 22px;
          background: var(--border-subtle);
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        .animate-fade-in { animation: fadeIn 0.5s ease-out; }
        .animate-slide-right { animation: slideRight 0.5s ease-out; }
        .stagger-children > * { animation: fadeIn 0.5s ease-out both; }
        .stagger-children > *:nth-child(1) { animation-delay: 0.05s; }
        .stagger-children > *:nth-child(2) { animation-delay: 0.12s; }
        .stagger-children > *:nth-child(3) { animation-delay: 0.19s; }
        .stagger-children > *:nth-child(4) { animation-delay: 0.26s; }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideRight {
          from { opacity: 0; transform: translateX(16px); }
          to { opacity: 1; transform: translateX(0); }
        }

        @media (prefers-reduced-motion: reduce) {
          .animate-fade-in, .animate-slide-right, .stagger-children > *, .spinner, .bg-orb {
            animation: none !important;
          }
        }

        @media (max-width: 480px) {
          .register-panel {
            padding: 16px;
          }
          .role-desc { display: none; }
          .role-grid {
            grid-template-columns: 1fr 1fr;
          }
          .requirements {
            grid-template-columns: 1fr;
          }
          .headline {
            font-size: 22px;
          }
          .brand-name {
            font-size: 17px;
          }
          .brand-mark {
            width: 32px;
            height: 32px;
          }
          .brand-mark svg {
            width: 16px;
            height: 16px;
          }
        }
      `}</style>
    </div>
  );
}