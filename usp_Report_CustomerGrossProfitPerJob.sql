SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
ALTER PROCEDURE [dbo].[usp_Report_CustomerGrossProfitPerJob]
(
    @Customer        NVARCHAR(MAX)  = NULL,
    @Priority        NVARCHAR(MAX)  = NULL,
    @AccountManager  NVARCHAR(MAX)  = NULL,
    @Trade           NVARCHAR(MAX)  = NULL,
    @DateFrom        Datetime2      = NULL,
    @DateTo          Datetime2      = NULL,
    -- pagination / sorting
    @Start           INT            = 0,
    @Length          INT            = 10,
    @SortColumn      NVARCHAR(50)   = N'Job Entry Date',
    @SortDirection   NVARCHAR(4)    = N'DESC'
)
AS
BEGIN
    SET NOCOUNT ON;

    /* 1) Drop temp tables */
    DROP TABLE IF EXISTS #tblCustomer;
    DROP TABLE IF EXISTS #tblPriority;
    DROP TABLE IF EXISTS #tblAccountManager;
    DROP TABLE IF EXISTS #tblTrade;
    DROP TABLE IF EXISTS #FilteredJobs;
    DROP TABLE IF EXISTS #ReportRows;
    DROP TABLE IF EXISTS #AggregatedRows;

    /* 2) Parse filters */
    CREATE TABLE #tblCustomer       (ID UNIQUEIDENTIFIER PRIMARY KEY);
    CREATE TABLE #tblPriority       (ID UNIQUEIDENTIFIER PRIMARY KEY);
    CREATE TABLE #tblAccountManager (ID UNIQUEIDENTIFIER PRIMARY KEY);
    CREATE TABLE #tblTrade          (ID UNIQUEIDENTIFIER PRIMARY KEY);

    IF @Customer IS NOT NULL
        INSERT INTO #tblCustomer
        SELECT TRY_CAST(value AS UNIQUEIDENTIFIER)
        FROM STRING_SPLIT(@Customer, ',')
        WHERE TRY_CAST(value AS UNIQUEIDENTIFIER) IS NOT NULL;

    IF @Priority IS NOT NULL
        INSERT INTO #tblPriority
        SELECT TRY_CAST(value AS UNIQUEIDENTIFIER)
        FROM STRING_SPLIT(@Priority, ',')
        WHERE TRY_CAST(value AS UNIQUEIDENTIFIER) IS NOT NULL;

    IF @AccountManager IS NOT NULL
        INSERT INTO #tblAccountManager
        SELECT TRY_CAST(value AS UNIQUEIDENTIFIER)
        FROM STRING_SPLIT(@AccountManager, ',')
        WHERE TRY_CAST(value AS UNIQUEIDENTIFIER) IS NOT NULL;

    IF @Trade IS NOT NULL
        INSERT INTO #tblTrade
        SELECT TRY_CAST(value AS UNIQUEIDENTIFIER)
        FROM STRING_SPLIT(@Trade, ',')
        WHERE TRY_CAST(value AS UNIQUEIDENTIFIER) IS NOT NULL;

    /* 3) Filter jobs */
    CREATE TABLE #FilteredJobs (JobKey UNIQUEIDENTIFIER PRIMARY KEY);

    INSERT INTO #FilteredJobs (JobKey)
    SELECT CAST(j.JobKey AS UNIQUEIDENTIFIER)
    FROM dbo.Job j
    WHERE ISNULL(j.IsDelete, 0) = 0
      AND j.JobKey IS NOT NULL
      AND (@Customer       IS NULL OR j.CustomerKey       IN (SELECT ID FROM #tblCustomer))
      AND (@Priority       IS NULL OR j.JobTypeKey        IN (SELECT ID FROM #tblPriority))
      AND (@AccountManager IS NULL OR j.AccountManagerKey IN (SELECT ID FROM #tblAccountManager))
      AND (@Trade          IS NULL OR j.TradeKey          IN (SELECT ID FROM #tblTrade))
      AND (@DateFrom IS NULL OR j.CompletionDate >= dbo.FUNCTION_LocalToUTCDateTime(@DateFrom, 'Eastern Standard Time'))
      AND (@DateTo   IS NULL OR j.CompletionDate <  dbo.FUNCTION_LocalToUTCDateTime(DATEADD(DAY, 1, @DateTo), 'Eastern Standard Time'));

    /* 4) Aggregation CTEs */
    ;WITH CustomerInvoice AS
    (
        SELECT jsi.JobKey,
               CustomerInvoiceTotal = SUM(ISNULL(jsid.Amt, 0.00))
        FROM dbo.JobSalesInvoice jsi
        INNER JOIN dbo.JobSalesInvoiceDetail jsid ON jsid.InvoiceKey = jsi.InvoiceKey
        INNER JOIN #FilteredJobs fj ON fj.JobKey = jsi.JobKey
        WHERE jsi.IsActive = 1 AND ISNULL(jsi.IsEstimate, 0) = 0
        GROUP BY jsi.JobKey
    ),
    RawVendorBilling AS
    (
        SELECT
            jb.JobKey,
            jb.VendorKey,
            VendorAmount = SUM(ISNULL(jbd.Qty, 0) * ISNULL(jbd.Amount, 0))
        FROM dbo.JobBill jb
        INNER JOIN dbo.JobBillDetail jbd ON jbd.BillKey = jb.BillKey
        INNER JOIN #FilteredJobs fj ON fj.JobKey = jb.JobKey
        WHERE jb.IsDelete IS NULL
        GROUP BY jb.JobKey, jb.VendorKey
    ),
    VendorBill AS
    (
        SELECT
            rvb.JobKey,
            VendorBillTotal = SUM(
                CASE WHEN np.PKey IS NULL THEN rvb.VendorAmount ELSE 0 END
            )
        FROM RawVendorBilling rvb
        LEFT JOIN dbo.NoPayablesToVendor np
            ON rvb.JobKey = np.JobKey AND rvb.VendorKey = np.VendorKey
        GROUP BY rvb.JobKey
    ),
    RevVendorDNE AS
    (
        SELECT jv.JobKey,
               VendorRevisedDNE = SUM(ISNULL(NULLIF(jv.RevVendorDNE, 0.00), ISNULL(jv.VendorDNE, 0.00)))
        FROM dbo.JobVendor jv
        INNER JOIN #FilteredJobs fj ON fj.JobKey = jv.JobKey
        WHERE ISNULL(jv.IsDelete, 0) = 0
        GROUP BY jv.JobKey
    )

    /* 5) Materialize into #ReportRows */
    SELECT
        JobPO                = j.PO,
        [Location]           = COALESCE(l.ServiceLocationName, l.Lname),
        [Location Address]   = LTRIM(RTRIM(
                                   COALESCE(l.Address, '')
                                 + CASE WHEN l.Address IS NOT NULL AND cl.CityName IS NOT NULL THEN ' , ' ELSE '' END
                                 + COALESCE(cl.CityName, '')
                                 + CASE WHEN cl.CityName IS NOT NULL AND sl.StateCode IS NOT NULL THEN ', ' ELSE '' END
                                 + COALESCE(sl.StateCode, '')
                                 + CASE WHEN l.ZIPcode IS NOT NULL THEN ' ' + l.ZIPcode ELSE '' END
                               )),
        Trade                = tr.TName,
        Priority             = jp.TName,
        [CustomerName]       = c.Cname,
        [AccountManagerName] = man.PName,
        PriorityColor        = jp.ColorCode,
        [Job Entry Date]     = j.EntryDate,
        [Vendor Name]        = COALESCE(vbVend.VendorName, jvVend.VendorName),
        [Customer Invoice]   = ISNULL(ci.CustomerInvoiceTotal, 0.00),
        [Vendor Bill]        = vb.VendorBillTotal,
        [Vendor Revised DNE] = CASE WHEN vb.VendorBillTotal IS NULL
                                     THEN ISNULL(rv.VendorRevisedDNE, 0.00)
                                     ELSE NULL END,
        [Gross Profit or Loss] = ISNULL(ci.CustomerInvoiceTotal, 0.00)
                                 - COALESCE(vb.VendorBillTotal, rv.VendorRevisedDNE, 0.00),
        [Margin Percent]     = CASE WHEN ISNULL(ci.CustomerInvoiceTotal, 0.00) = 0 THEN NULL
                                    ELSE ((ISNULL(ci.CustomerInvoiceTotal, 0.00)
                                           - COALESCE(vb.VendorBillTotal, rv.VendorRevisedDNE, 0.00))
                                          / NULLIF(ci.CustomerInvoiceTotal, 0.00)) * 100.0 END,
        [Used VendorBill Or DNE] = CASE
                                       WHEN vb.VendorBillTotal IS NOT NULL THEN 'VendorBill'
                                       WHEN rv.VendorRevisedDNE IS NOT NULL THEN 'VendorDNE'
                                       WHEN rv.VendorRevisedDNE IS NOT NULL AND vb.VendorBillTotal IS NOT NULL THEN 'VendorBill & VendorDNE'
                                       ELSE 'None' END
    INTO #ReportRows
    FROM #FilteredJobs fj
    INNER JOIN dbo.Job j           ON j.JobKey = fj.JobKey
    INNER JOIN dbo.Customer c      ON j.CustomerKey = c.CustomerKey
    INNER JOIN dbo.stafflist man   ON j.[AccountManagerKey] = man.personnelkey
    LEFT JOIN dbo.Location l       ON l.LocationKey = j.LocationKey
    LEFT JOIN dbo.CityList cl      ON cl.CityKey = l.CityKey
    LEFT JOIN dbo.StateList sl     ON sl.PKey = l.StateCode
    LEFT JOIN dbo.JobType jp       ON jp.ID = j.JobTypeKey
    LEFT JOIN dbo.Trade tr         ON tr.ID = j.TradeKey
    LEFT JOIN CustomerInvoice ci   ON ci.JobKey = j.JobKey
    LEFT JOIN VendorBill vb        ON vb.JobKey = j.JobKey
    LEFT JOIN RevVendorDNE rv      ON rv.JobKey = j.JobKey
    OUTER APPLY (
        SELECT TOP (1) v.Vname AS VendorName
        FROM dbo.JobBill jb
        INNER JOIN dbo.Vendor v ON v.VendorKey = jb.VendorKey
        WHERE jb.JobKey = j.JobKey AND ISNULL(jb.DepositBill, 0) = 0 AND ISNULL(jb.IsDelete, 0) = 0
        ORDER BY jb.BillDate DESC, jb.BillNo DESC
    ) vbVend
    OUTER APPLY (
        SELECT TOP (1) v.Vname AS VendorName
        FROM dbo.JobVendor jv
        INNER JOIN dbo.Vendor v ON v.VendorKey = jv.VendorKey
        WHERE jv.JobKey = j.JobKey AND ISNULL(jv.IsDelete, 0) = 0
        ORDER BY ISNULL(jv.IsPrimaryVendor, 0) DESC, ISNULL(jv.IsDefault, 0) DESC, jv.EnteredOn DESC
    ) jvVend;

    /* 6) Aggregate by JobPO into #AggregatedRows */
    ;WITH Aggregated AS
    (
        SELECT
            JobPO,
            [Location]             = MAX([Location]),
            [Location Address]     = MAX([Location Address]),
            Trade                  = MAX(Trade),
            Priority               = MAX(Priority),
            PriorityColor          = MAX(PriorityColor),
            [Vendor Name]          = MAX([Vendor Name]),
            [Customer Name]        = MAX([CustomerName]),
            [Account Manager Name] = MAX([AccountManagerName]),
            [Job Entry Date]       = MAX([Job Entry Date]),
            [Customer Invoice]     = SUM(ISNULL([Customer Invoice], 0)),
            [Vendor Bill]          = SUM(CASE WHEN ISNULL([Vendor Bill], 0) > 0
                                              THEN ISNULL([Vendor Bill], 0)
                                              ELSE 0 END),
            [Vendor Revised DNE]   = SUM(CASE WHEN ISNULL([Vendor Revised DNE], 0) > 0
                                              THEN ISNULL([Vendor Revised DNE], 0)
                                              ELSE 0 END)
        FROM #ReportRows
        GROUP BY JobPO
    )
    SELECT *,
        [Gross Profit or Loss] = [Customer Invoice]
                                 - CASE WHEN [Vendor Bill] > 0 THEN [Vendor Bill]
                                        ELSE [Vendor Revised DNE] END,
        [Margin Percent]       = CASE WHEN [Customer Invoice] = 0 THEN NULL
                                      ELSE (([Customer Invoice]
                                             - CASE WHEN [Vendor Bill] > 0 THEN [Vendor Bill]
                                                    ELSE [Vendor Revised DNE] END)
                                            / NULLIF([Customer Invoice], 0)) * 100.0 END,
        [Used VendorBill Or DNE] = CASE WHEN [Vendor Bill] > 0 THEN 'VendorBill'
                                        WHEN [Vendor Revised DNE] > 0 THEN 'VendorDNE'
                                        ELSE 'None' END
    INTO #AggregatedRows
    FROM Aggregated;

    /* ============================
       RESULT SET 1 — counts & totals (from aggregated data)
    ============================ */
    DECLARE @TotalRecords          INT           = (SELECT COUNT(*)                FROM #AggregatedRows);
    DECLARE @FilteredRecords       INT           = @TotalRecords;
    DECLARE @TotalCustomerInvoice  NUMERIC(18,2) = (SELECT SUM([Customer Invoice])   FROM #AggregatedRows);
    DECLARE @TotalVendorBill       NUMERIC(18,2) = (SELECT SUM([Vendor Bill])        FROM #AggregatedRows);
    DECLARE @TotalVendorRevisedDNE NUMERIC(18,2) = (SELECT SUM([Vendor Revised DNE]) FROM #AggregatedRows);

    SELECT totalRecords          = @TotalRecords,
           filteredRecords       = @FilteredRecords,
           totalCustomerInvoice  = @TotalCustomerInvoice,
           totalVendorBill       = @TotalVendorBill,
           totalVendorRevisedDNE = @TotalVendorRevisedDNE;

    /* ============================
       RESULT SET 2 — sort the full list, then paginate
    ============================ */
    SELECT *
    FROM #AggregatedRows
    ORDER BY
        CASE WHEN @SortDirection = 'ASC'  AND @SortColumn = 'JobPO'                THEN [JobPO]                END ASC,
        CASE WHEN @SortDirection = 'DESC' AND @SortColumn = 'JobPO'                THEN [JobPO]                END DESC,
        CASE WHEN @SortDirection = 'ASC'  AND @SortColumn = 'Job Entry Date'       THEN [Job Entry Date]       END ASC,
        CASE WHEN @SortDirection = 'DESC' AND @SortColumn = 'Job Entry Date'       THEN [Job Entry Date]       END DESC,
        CASE WHEN @SortDirection = 'ASC'  AND @SortColumn = 'Customer Invoice'     THEN [Customer Invoice]     END ASC,
        CASE WHEN @SortDirection = 'DESC' AND @SortColumn = 'Customer Invoice'     THEN [Customer Invoice]     END DESC,
        CASE WHEN @SortDirection = 'ASC'  AND @SortColumn = 'Vendor Bill'          THEN [Vendor Bill]          END ASC,
        CASE WHEN @SortDirection = 'DESC' AND @SortColumn = 'Vendor Bill'          THEN [Vendor Bill]          END DESC,
        CASE WHEN @SortDirection = 'ASC'  AND @SortColumn = 'Vendor Revised DNE'   THEN [Vendor Revised DNE]   END ASC,
        CASE WHEN @SortDirection = 'DESC' AND @SortColumn = 'Vendor Revised DNE'   THEN [Vendor Revised DNE]   END DESC,
        CASE WHEN @SortDirection = 'ASC'  AND @SortColumn = 'Gross Profit or Loss' THEN [Gross Profit or Loss] END ASC,
        CASE WHEN @SortDirection = 'DESC' AND @SortColumn = 'Gross Profit or Loss' THEN [Gross Profit or Loss] END DESC,
        CASE WHEN @SortDirection = 'ASC'  AND @SortColumn = 'Margin Percent'       THEN [Margin Percent]       END ASC,
        CASE WHEN @SortDirection = 'DESC' AND @SortColumn = 'Margin Percent'       THEN [Margin Percent]       END DESC
    OFFSET @Start ROWS FETCH NEXT @Length ROWS ONLY;

    /* Cleanup */
    DROP TABLE IF EXISTS #ReportRows;
    DROP TABLE IF EXISTS #AggregatedRows;
END
GO
