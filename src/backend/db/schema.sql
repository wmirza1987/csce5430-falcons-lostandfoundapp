-- Azure SQL schema for Lost and Found for Campus.
-- Idempotent: safe to run repeatedly (db/migrate.js applies it).
-- All ids are UNIQUEIDENTIFIER. All timestamps are UTC DATETIME2.

IF OBJECT_ID('dbo.Users') IS NULL
CREATE TABLE dbo.Users (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Users PRIMARY KEY DEFAULT NEWID(),
  firstName NVARCHAR(50) NOT NULL,
  lastName NVARCHAR(50) NOT NULL,
  email NVARCHAR(254) NOT NULL,
  passwordHash NVARCHAR(100) NOT NULL,
  role NVARCHAR(10) NOT NULL CONSTRAINT DF_Users_role DEFAULT 'user'
    CONSTRAINT CK_Users_role CHECK (role IN ('user','moderator','admin')),
  isEmailVerified BIT NOT NULL CONSTRAINT DF_Users_ver DEFAULT 0,
  isActive BIT NOT NULL CONSTRAINT DF_Users_act DEFAULT 1,
  emailNotifications BIT NOT NULL CONSTRAINT DF_Users_en DEFAULT 1,
  emailVerificationTokenHash CHAR(64) NULL,
  emailVerificationExpires DATETIME2 NULL,
  passwordResetTokenHash CHAR(64) NULL,
  passwordResetExpires DATETIME2 NULL,
  createdAt DATETIME2 NOT NULL CONSTRAINT DF_Users_c DEFAULT SYSUTCDATETIME(),
  updatedAt DATETIME2 NOT NULL CONSTRAINT DF_Users_u DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UQ_Users_email UNIQUE (email)
);

IF OBJECT_ID('dbo.Listings') IS NULL
CREATE TABLE dbo.Listings (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Listings PRIMARY KEY DEFAULT NEWID(),
  type NVARCHAR(5) NOT NULL CONSTRAINT CK_Listings_type CHECK (type IN ('lost','found')),
  title NVARCHAR(100) NOT NULL,
  category NVARCHAR(60) NOT NULL,
  brand NVARCHAR(60) NOT NULL CONSTRAINT DF_L_brand DEFAULT '',
  color NVARCHAR(40) NOT NULL CONSTRAINT DF_L_color DEFAULT '',
  description NVARCHAR(1000) NOT NULL,
  date DATETIME2 NOT NULL,
  building NVARCHAR(100) NOT NULL,
  zone NVARCHAR(100) NULL,
  imagesJson NVARCHAR(2000) NOT NULL CONSTRAINT DF_L_img DEFAULT '[]',
  status NVARCHAR(10) NOT NULL CONSTRAINT DF_L_status DEFAULT 'active'
    CONSTRAINT CK_Listings_status CHECK (status IN ('active','resolved')),
  privateDetails NVARCHAR(500) NULL,
  createdBy UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_L_user REFERENCES dbo.Users(id),
  isDeleted BIT NOT NULL CONSTRAINT DF_L_del DEFAULT 0,
  isHidden BIT NOT NULL CONSTRAINT DF_L_hid DEFAULT 0,
  hiddenReason NVARCHAR(500) NOT NULL CONSTRAINT DF_L_hr DEFAULT '',
  hiddenBy UNIQUEIDENTIFIER NULL,
  hiddenAt DATETIME2 NULL,
  createdAt DATETIME2 NOT NULL CONSTRAINT DF_L_c DEFAULT SYSUTCDATETIME(),
  updatedAt DATETIME2 NOT NULL CONSTRAINT DF_L_u DEFAULT SYSUTCDATETIME()
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Listings_browse')
  CREATE INDEX IX_Listings_browse ON dbo.Listings (isDeleted, isHidden, status, type, createdAt DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Listings_loc')
  CREATE INDEX IX_Listings_loc ON dbo.Listings (category, building, zone);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Listings_owner')
  CREATE INDEX IX_Listings_owner ON dbo.Listings (createdBy);

IF OBJECT_ID('dbo.Matches') IS NULL
CREATE TABLE dbo.Matches (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Matches PRIMARY KEY DEFAULT NEWID(),
  lostListing UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_M_lost REFERENCES dbo.Listings(id),
  foundListing UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_M_found REFERENCES dbo.Listings(id),
  score DECIMAL(4,2) NOT NULL CONSTRAINT CK_M_score CHECK (score BETWEEN 0 AND 1),
  factorsJson NVARCHAR(MAX) NOT NULL,
  createdAt DATETIME2 NOT NULL CONSTRAINT DF_M_c DEFAULT SYSUTCDATETIME(),
  updatedAt DATETIME2 NOT NULL CONSTRAINT DF_M_u DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UQ_Matches_pair UNIQUE (lostListing, foundListing)
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Matches_found')
  CREATE INDEX IX_Matches_found ON dbo.Matches (foundListing);

IF OBJECT_ID('dbo.Claims') IS NULL
CREATE TABLE dbo.Claims (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Claims PRIMARY KEY DEFAULT NEWID(),
  matchId UNIQUEIDENTIFIER NOT NULL,
  listing UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_C_listing REFERENCES dbo.Listings(id),
  claimant UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_C_claimant REFERENCES dbo.Users(id),
  explanationCiphertext NVARCHAR(MAX) NOT NULL,
  status NVARCHAR(10) NOT NULL CONSTRAINT DF_C_status DEFAULT 'pending'
    CONSTRAINT CK_Claims_status CHECK (status IN ('pending','approved','rejected','closed')),
  decisionNote NVARCHAR(500) NOT NULL CONSTRAINT DF_C_note DEFAULT '',
  decidedBy UNIQUEIDENTIFIER NULL,
  decidedAt DATETIME2 NULL,
  createdAt DATETIME2 NOT NULL CONSTRAINT DF_C_c DEFAULT SYSUTCDATETIME(),
  updatedAt DATETIME2 NOT NULL CONSTRAINT DF_C_u DEFAULT SYSUTCDATETIME()
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Claims_listing')
  CREATE INDEX IX_Claims_listing ON dbo.Claims (listing, status, createdAt);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Claims_claimant')
  CREATE INDEX IX_Claims_claimant ON dbo.Claims (claimant, matchId, status);

IF OBJECT_ID('dbo.ClaimEvidence') IS NULL
CREATE TABLE dbo.ClaimEvidence (
  claimId UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_CE_claim REFERENCES dbo.Claims(id),
  idx TINYINT NOT NULL CONSTRAINT CK_CE_idx CHECK (idx IN (0,1)),
  blobName NVARCHAR(200) NOT NULL,
  mimeType NVARCHAR(30) NOT NULL,
  sizeBytes INT NOT NULL CONSTRAINT CK_CE_size CHECK (sizeBytes > 0),
  iv NVARCHAR(64) NOT NULL,
  authTag NVARCHAR(64) NOT NULL,
  CONSTRAINT PK_ClaimEvidence PRIMARY KEY (claimId, idx)
);

IF OBJECT_ID('dbo.Messages') IS NULL
CREATE TABLE dbo.Messages (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Messages PRIMARY KEY DEFAULT NEWID(),
  claim UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_Msg_claim REFERENCES dbo.Claims(id),
  listing UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_Msg_listing REFERENCES dbo.Listings(id),
  sender UNIQUEIDENTIFIER NULL,
  kind NVARCHAR(6) NOT NULL CONSTRAINT DF_Msg_kind DEFAULT 'user'
    CONSTRAINT CK_Msg_kind CHECK (kind IN ('system','user')),
  body NVARCHAR(1000) NOT NULL,
  containsContactDetails BIT NOT NULL CONSTRAINT DF_Msg_cd DEFAULT 0,
  flagged BIT NOT NULL CONSTRAINT DF_Msg_fl DEFAULT 0,
  flaggedBy UNIQUEIDENTIFIER NULL,
  flaggedAt DATETIME2 NULL,
  flagReason NVARCHAR(300) NULL,
  isHidden BIT NOT NULL CONSTRAINT DF_Msg_hid DEFAULT 0,
  hiddenBy UNIQUEIDENTIFIER NULL,
  hiddenAt DATETIME2 NULL,
  hiddenReason NVARCHAR(500) NOT NULL CONSTRAINT DF_Msg_hr DEFAULT '',
  createdAt DATETIME2 NOT NULL CONSTRAINT DF_Msg_c DEFAULT SYSUTCDATETIME(),
  updatedAt DATETIME2 NOT NULL CONSTRAINT DF_Msg_u DEFAULT SYSUTCDATETIME()
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Messages_claim')
  CREATE INDEX IX_Messages_claim ON dbo.Messages (claim, createdAt);

IF OBJECT_ID('dbo.Notifications') IS NULL
CREATE TABLE dbo.Notifications (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Notifications PRIMARY KEY DEFAULT NEWID(),
  userId UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_N_user REFERENCES dbo.Users(id),
  type NVARCHAR(20) NOT NULL CONSTRAINT CK_N_type CHECK (type IN
    ('match','claim','claim_decision','claim_closed','resolution','message','moderation')),
  message NVARCHAR(500) NOT NULL,
  actionPath NVARCHAR(200) NOT NULL CONSTRAINT DF_N_ap DEFAULT '',
  listing UNIQUEIDENTIFIER NULL,
  claim UNIQUEIDENTIFIER NULL,
  isRead BIT NOT NULL CONSTRAINT DF_N_read DEFAULT 0,
  emailStatus NVARCHAR(14) NOT NULL CONSTRAINT DF_N_es DEFAULT 'not_requested'
    CONSTRAINT CK_N_es CHECK (emailStatus IN ('not_requested','pending','sent','failed','skipped')),
  emailAttempts INT NOT NULL CONSTRAINT DF_N_ea DEFAULT 0,
  emailSubject NVARCHAR(150) NULL,
  emailBody NVARCHAR(1000) NULL,
  createdAt DATETIME2 NOT NULL CONSTRAINT DF_N_c DEFAULT SYSUTCDATETIME(),
  updatedAt DATETIME2 NOT NULL CONSTRAINT DF_N_u DEFAULT SYSUTCDATETIME()
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Notifications_user')
  CREATE INDEX IX_Notifications_user ON dbo.Notifications (userId, isRead, createdAt DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Notifications_email')
  CREATE INDEX IX_Notifications_email ON dbo.Notifications (emailStatus, createdAt);

IF OBJECT_ID('dbo.Reports') IS NULL
CREATE TABLE dbo.Reports (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Reports PRIMARY KEY DEFAULT NEWID(),
  reporter UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_R_reporter REFERENCES dbo.Users(id),
  targetType NVARCHAR(10) NOT NULL CONSTRAINT CK_R_tt CHECK (targetType IN ('listing','message')),
  targetId UNIQUEIDENTIFIER NOT NULL,
  listing UNIQUEIDENTIFIER NULL,
  claim UNIQUEIDENTIFIER NULL,
  reason NVARCHAR(500) NOT NULL,
  status NVARCHAR(10) NOT NULL CONSTRAINT DF_R_status DEFAULT 'open'
    CONSTRAINT CK_R_status CHECK (status IN ('open','reviewing','resolved')),
  decision NVARCHAR(10) NULL CONSTRAINT CK_R_dec CHECK (decision IN ('hide','restore','dismiss')),
  decisionNote NVARCHAR(500) NOT NULL CONSTRAINT DF_R_note DEFAULT '',
  handledBy UNIQUEIDENTIFIER NULL,
  handledAt DATETIME2 NULL,
  threadAccessAt DATETIME2 NULL,
  createdAt DATETIME2 NOT NULL CONSTRAINT DF_R_c DEFAULT SYSUTCDATETIME(),
  updatedAt DATETIME2 NOT NULL CONSTRAINT DF_R_u DEFAULT SYSUTCDATETIME()
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Reports_status')
  CREATE INDEX IX_Reports_status ON dbo.Reports (status, createdAt DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Reports_target')
  CREATE INDEX IX_Reports_target ON dbo.Reports (targetType, targetId);

IF OBJECT_ID('dbo.AuditLogs') IS NULL
CREATE TABLE dbo.AuditLogs (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_AuditLogs PRIMARY KEY DEFAULT NEWID(),
  actor UNIQUEIDENTIFIER NOT NULL,
  action NVARCHAR(80) NOT NULL,
  targetType NVARCHAR(40) NOT NULL,
  targetId UNIQUEIDENTIFIER NULL,
  detail NVARCHAR(300) NOT NULL CONSTRAINT DF_A_d DEFAULT '',
  createdAt DATETIME2 NOT NULL CONSTRAINT DF_A_c DEFAULT SYSUTCDATETIME(),
  updatedAt DATETIME2 NOT NULL CONSTRAINT DF_A_u DEFAULT SYSUTCDATETIME()
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Audit_created')
  CREATE INDEX IX_Audit_created ON dbo.AuditLogs (createdAt DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Audit_action')
  CREATE INDEX IX_Audit_action ON dbo.AuditLogs (action, createdAt DESC);

IF OBJECT_ID('dbo.Categories') IS NULL
CREATE TABLE dbo.Categories (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Categories PRIMARY KEY DEFAULT NEWID(),
  name NVARCHAR(60) NOT NULL,
  description NVARCHAR(300) NOT NULL CONSTRAINT DF_Cat_d DEFAULT '',
  isActive BIT NOT NULL CONSTRAINT DF_Cat_a DEFAULT 1,
  createdBy UNIQUEIDENTIFIER NULL,
  createdAt DATETIME2 NOT NULL CONSTRAINT DF_Cat_c DEFAULT SYSUTCDATETIME(),
  updatedAt DATETIME2 NOT NULL CONSTRAINT DF_Cat_u DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UQ_Categories_name UNIQUE (name)
);

-- Strict message order: createdAt ties (messages sent in the same instant) are
-- broken by this identity value instead of the random GUID id.
IF COL_LENGTH('dbo.Messages', 'seq') IS NULL
  ALTER TABLE dbo.Messages ADD seq BIGINT IDENTITY(1,1) NOT NULL;
